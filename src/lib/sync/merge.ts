import type { AppSettings, Entry, ExportPreset, LocalDictMeta, LookupSourceConfig, Wordbook } from "../types";
import { deriveStatusFromSrs } from "../study/engine";
import { emptyDailyLog, type StudyDailyLog } from "../study/types";
import { pickLocalSettings } from "./types";
import { quickHash, stableJson } from "./pack";
import type {
  BaseHashes,
  MergeApplied,
  MergeConflict,
  MergeInput,
  MergeResult,
  SyncState,
  SyncTombstone,
} from "./types";

/**
 * 同步合并引擎（纯函数 · 确定性 · 可交换 · 幂等）
 * ------------------------------------------------------------------
 * 规则（docs/research/sync-2026-10.md §2.3）：
 * - Book 级字段（meta/schema/exportSettings/studyConfig）：三方指纹 base/local/remote——单边改取改方，双改冲突（默认 remote，可翻转）；
 * - Entry 主体：(updatedAt, deviceId) LWW；冲突 = 双端 updatedAt > lastSyncAt 且内容不同；
 * - Entry.srs：仅一端复习 → 取该端；双端 → lastReview 晚者胜（平局 reps→due→deviceId）；显式重置尊重（无 srs 且晚于对方 lastReview 的编辑视为重置）；
 * - study.daily：按日逐计数器 max（幂等/可交换/可结合；不求和，避免重复计）；
 * - Settings：整体三方指纹（lastBookId 永久排除）；lookupSources：按 id 三方指纹 + 墓碑；dictionaries：importedAt 新者胜；
 * - 墓碑：删除 vs 存活按 deletedAt 与 updatedAt 时间线裁决；180 天 TTL（meta.now 提供时钟，缺省不裁剪）。
 */

const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/* ---------------- 指纹 ---------------- */

/** 同步域设置的规范指纹：排除 lastBookId、设备本地字段（theme/accent）与 updatedAt 元数据 */
function syncedSettingsHash(s: Partial<AppSettings>): string {
  const { theme: _theme, accent: _accent, lastBookId: _last, updatedAt: _updated, ...rest } = s;
  void _theme;
  void _accent;
  void _last;
  void _updated;
  return quickHash(rest);
}

function bookHashes(book: Wordbook): BaseHashes["books"][string] {
  return {
    schemaHash: quickHash(book.schema),
    exportSettingsHash: quickHash(book.exportSettings),
    metaHash: quickHash({ name: book.name, description: book.description ?? "", tags: book.tags, meta: book.meta ?? null }),
    studyConfigHash: quickHash(book.study?.config ?? null),
  };
}

export function computeBaseHashes(state: SyncState): BaseHashes {
  const books: BaseHashes["books"] = {};
  for (const b of state.books) books[b.id] = bookHashes(b);
  const lookupSources: Record<string, string> = {};
  for (const s of state.lookupSources) lookupSources[s.id] = quickHash(s);
  const dictionaries: Record<string, string> = {};
  for (const d of state.dictionaries) dictionaries[d.id] = quickHash(d);
  const exportPresets: Record<string, string> = {};
  for (const p of state.exportPresets ?? []) exportPresets[p.id] = quickHash(p);
  return { settings: syncedSettingsHash(state.settings), books, lookupSources, dictionaries, exportPresets };
}

/* ---------------- 通用裁决 ---------------- */

/** (updatedAt, deviceId) 字典序 LWW：返回 true 表示 a 胜 */
function lwwWins(aUpdated: number, aDevice: string, bUpdated: number, bDevice: string): boolean {
  if (aUpdated !== bUpdated) return aUpdated > bUpdated;
  return aDevice >= bDevice;
}

interface TrioArgs {
  baseHash: string | undefined;
  localHash: string;
  remoteHash: string;
}

/** 三方指纹：'same' | 'local' | 'remote' | 'conflict' */
function trioVerdict({ baseHash, localHash, remoteHash }: TrioArgs): "same" | "local" | "remote" | "conflict" {
  if (localHash === remoteHash) return "same";
  if (baseHash !== undefined) {
    if (localHash === baseHash) return "remote";
    if (remoteHash === baseHash) return "local";
  }
  return "conflict";
}

/** 条目「内容材料」哈希（排除 srs/status——它们有独立的合并规则） */
function entryMaterialHash(e: Entry): string {
  return quickHash({
    headword: e.headword,
    tags: e.tags,
    starred: Boolean(e.starred),
    values: e.values,
  });
}

/* ---------------- daily 合并 ---------------- */

function mergeDailyLog(a: StudyDailyLog, b: StudyDailyLog): StudyDailyLog {
  const out = { ...emptyDailyLog(), ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number") {
      const prev = typeof (out as Record<string, unknown>)[k] === "number" ? ((out as unknown as Record<string, number>)[k] ?? 0) : 0;
      (out as unknown as Record<string, number>)[k] = Math.max(prev, v);
    }
  }
  return out;
}

function mergeDaily(
  a: Record<string, StudyDailyLog> | undefined,
  b: Record<string, StudyDailyLog> | undefined,
): Record<string, StudyDailyLog> {
  const out: Record<string, StudyDailyLog> = {};
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  for (const k of keys) {
    const la = a?.[k];
    const lb = b?.[k];
    out[k] = la && lb ? mergeDailyLog(la, lb) : ((la ?? lb) as StudyDailyLog);
  }
  return out;
}

/* ---------------- srs 合并 ---------------- */

function reviewed(srs: Entry["srs"]): boolean {
  return Boolean(srs && srs.reps > 0);
}

function pickSrs(
  local: Entry,
  remote: Entry,
  localDevice: string,
  remoteDevice: string,
): { srs: Entry["srs"]; reset: boolean } {
  const a = local.srs;
  const b = remote.srs;
  const aReviewed = reviewed(a);
  const bReviewed = reviewed(b);
  if (aReviewed && !bReviewed) {
    // 显式重置：远端无 srs 且其条目比本地复习与本地条目都更新 → 尊重重置
    const remoteReset = !b && remote.updatedAt > (a?.lastReview ?? 0) && remote.updatedAt > local.updatedAt;
    return remoteReset ? { srs: undefined, reset: true } : { srs: a, reset: false };
  }
  if (bReviewed && !aReviewed) {
    const localReset = !a && local.updatedAt > (b?.lastReview ?? 0) && local.updatedAt > remote.updatedAt;
    return localReset ? { srs: undefined, reset: true } : { srs: b, reset: false };
  }
  if (!aReviewed && !bReviewed) return { srs: undefined, reset: false };
  // 双端都有复习记录
  const aKey = a?.lastReview ?? 0;
  const bKey = b?.lastReview ?? 0;
  if (aKey !== bKey) return aKey > bKey ? { srs: a, reset: false } : { srs: b, reset: false };
  if ((a?.reps ?? 0) !== (b?.reps ?? 0)) return (a?.reps ?? 0) > (b?.reps ?? 0) ? { srs: a, reset: false } : { srs: b, reset: false };
  if ((a?.due ?? 0) !== (b?.due ?? 0)) return (a?.due ?? 0) > (b?.due ?? 0) ? { srs: a, reset: false } : { srs: b, reset: false };
  return localDevice >= remoteDevice ? { srs: a, reset: false } : { srs: b, reset: false };
}

/* ---------------- 条目合并 ---------------- */

interface EntryMergeOutcome {
  entry: Entry;
  conflict: MergeConflict | null;
}

function mergeEntry(
  local: Entry,
  remote: Entry,
  meta: MergeInput["meta"],
  resolutions: Record<string, "local" | "remote">,
  entityKey: string,
): EntryMergeOutcome {
  const localWins = lwwWins(local.updatedAt, meta.localDeviceId, remote.updatedAt, meta.remoteDeviceId);
  const winner = localWins ? local : remote;
  const loser = localWins ? remote : local;

  const { srs, reset } = pickSrs(local, remote, meta.localDeviceId, meta.remoteDeviceId);
  const status: Entry["status"] = srs !== undefined ? deriveStatusFromSrs(srs) : winner.status;

  let conflict: MergeConflict | null = null;
  const bothEdited =
    meta.lastSyncAt !== null && local.updatedAt > meta.lastSyncAt && remote.updatedAt > meta.lastSyncAt;
  if (bothEdited && entryMaterialHash(local) !== entryMaterialHash(remote)) {
    const forced = resolutions[entityKey];
    const chosen: "local" | "remote" = forced ?? (localWins ? "local" : "remote");
    conflict = { entityKey, kind: "entry", label: winner.headword, chosen, canFlip: forced === undefined };
  }

  const chosenSide = conflict?.chosen ?? (localWins ? "local" : "remote");
  const body = chosenSide === "local" ? local : remote;
  void winner;
  void loser;
  const entry: Entry = {
    ...body,
    srs,
    status: reset ? "new" : status,
  };
  return { entry, conflict };
}

/** 远端新增条目：保留本地顺序，远端项按 createdAt 降序追加在末尾（确定性、幂等） */
function insertRemoteEntries(localEntries: Entry[], remoteOnly: Entry[]): Entry[] {
  const sorted = [...remoteOnly].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
  return [...localEntries, ...sorted];
}

/* ---------------- 主体 ---------------- */

export function mergeSync(input: MergeInput): MergeResult {
  const { local, remote, meta } = input;
  const resolutions = input.resolutions ?? {};
  const conflicts: MergeConflict[] = [];
  const applied: MergeApplied = {
    booksAdded: 0,
    booksUpdated: 0,
    booksDeleted: 0,
    entriesAdded: 0,
    entriesUpdated: 0,
    entriesDeleted: 0,
  };

  // 墓碑：并集 + TTL 裁剪
  const now = meta.now ?? 0;
  const allTombstones = mergeAllTombstones([
    ...meta.tombstones,
    ...remote.tombstones.map((t) => ({ ...t, deviceId: t.deviceId || meta.remoteDeviceId })),
  ]);
  const nextTombstones = now > 0 ? allTombstones.filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS) : allTombstones;
  const tombByKey = new Map(allTombstones.map((t) => [`${t.kind}:${t.bookId ?? ""}:${t.id}`, t]));

  // ---- Books ----
  const localBooks = new Map<string, Wordbook>(local.books.map((b) => [b.id, b]));
  const remoteBooks = new Map<string, Wordbook>(
    remote.books.map((rb) => [rb.book.id, { ...rb.book, entries: rb.entries ?? [] } as Wordbook]),
  );
  const orderedIds = [
    ...local.books.map((b) => b.id),
    ...remote.books.map((rb) => rb.book.id).filter((id) => !localBooks.has(id)),
  ];

  const outBooks: Wordbook[] = [];
  for (const id of orderedIds) {
    const lb = localBooks.get(id);
    const rb = remoteBooks.get(id);
    const survivorUpdated = Math.max(lb?.updatedAt ?? 0, rb?.updatedAt ?? 0);
    const tomb = tombByKey.get(`book::${id}`);

    if (tomb && (!lb && !rb ? true : tomb.deletedAt >= survivorUpdated)) {
      // 删除胜：整书移除（含其词条）
      applied.booksDeleted += 1;
      applied.entriesDeleted += (lb?.entries.length ?? 0) + (rb && !lb ? (rb.entries?.length ?? 0) : 0);
      continue;
    }

    if (lb && !rb) {
      outBooks.push(lb);
      continue;
    }
    if (!lb && rb) {
      outBooks.push(rb);
      applied.booksAdded += 1;
      applied.entriesAdded += rb.entries.length;
      continue;
    }
    if (!lb || !rb) continue;

    // 双方都有：字段级三方指纹
    const lh = bookHashes(lb);
    const rh = bookHashes(rb);
    const baseH = meta.base?.books[id];
    const pickSide = (field: "schemaHash" | "exportSettingsHash" | "metaHash" | "studyConfigHash"): "local" | "remote" => {
      const verdict = trioVerdict({
        baseHash: baseH?.[field],
        localHash: lh[field],
        remoteHash: rh[field],
      });
      if (verdict === "same") return "local";
      if (verdict === "local" || verdict === "remote") return verdict;
      const key = `book:${id}:${field.replace("Hash", "")}`;
      const kind = field === "metaHash" ? "bookMeta" : (field === "schemaHash" ? "schema" : field === "exportSettingsHash" ? "exportSettings" : "studyConfig") as MergeConflict["kind"];
      const forced = resolutions[key];
      const chosen: "local" | "remote" = forced ?? (lwwWins(lb.updatedAt, meta.localDeviceId, rb.updatedAt, meta.remoteDeviceId) ? "local" : "remote");
      conflicts.push({ entityKey: key, kind, label: lb.name, chosen, canFlip: forced === undefined });
      return chosen;
    };

    const schemaSide = pickSide("schemaHash");
    const exportSide = pickSide("exportSettingsHash");
    const metaSide = pickSide("metaHash");
    const studyCfgSide = pickSide("studyConfigHash");

    // 条目合并
    const localE = new Map(lb.entries.map((e) => [e.id, e]));
    const remoteE = new Map(rb.entries.map((e) => [e.id, e]));
    const survivorEntries: Entry[] = [];
    const remoteOnly: Entry[] = [];
    for (const e of lb.entries) {
      const re = remoteE.get(e.id);
      const eTomb = tombByKey.get(`entry:${id}:${e.id}`);
      if (eTomb && eTomb.deletedAt >= Math.max(e.updatedAt, re?.updatedAt ?? 0)) {
        applied.entriesDeleted += 1;
        continue;
      }
      if (!re) {
        survivorEntries.push(e);
        continue;
      }
      const { entry, conflict } = mergeEntry(e, re, meta, resolutions, `entry:${id}:${e.id}`);
      survivorEntries.push(entry);
      if (conflict) conflicts.push(conflict);
      if (stableJson(entry) !== stableJson(e)) applied.entriesUpdated += 1;
    }
    for (const re of rb.entries) {
      if (localE.has(re.id)) continue;
      const eTomb = tombByKey.get(`entry:${id}:${re.id}`);
      if (eTomb && eTomb.deletedAt >= re.updatedAt) {
        applied.entriesDeleted += 1;
        continue;
      }
      remoteOnly.push(re);
      applied.entriesAdded += 1;
    }
    const mergedEntries = insertRemoteEntries(survivorEntries, remoteOnly);

    let study: Wordbook["study"];
    if (!lb.study && !rb.study) study = undefined;
    else if (!lb.study || !rb.study) study = lb.study ?? rb.study;
    else
      study = {
        config: studyCfgSide === "local" ? lb.study.config : rb.study.config,
        daily: mergeDaily(lb.study.daily, rb.study.daily),
      };

    const merged: Wordbook = {
      ...(metaSide === "local" ? lb : rb),
      name: metaSide === "local" ? lb.name : rb.name,
      description: metaSide === "local" ? lb.description : rb.description,
      tags: metaSide === "local" ? lb.tags : rb.tags,
      meta: metaSide === "local" ? lb.meta : rb.meta,
      updatedAt: Math.max(lb.updatedAt, rb.updatedAt),
      schema: schemaSide === "local" ? lb.schema : rb.schema,
      exportSettings: exportSide === "local" ? lb.exportSettings : rb.exportSettings,
      entries: mergedEntries,
      study,
    } as Wordbook;
    if (stableJson(merged) !== stableJson(lb)) applied.booksUpdated += 1;
    outBooks.push(merged);
  }

  // ---- Settings（lastBookId 与设备本地字段：明暗/强调色 永久排除） ----
  let settings: AppSettings = local.settings;
  if (remote.settings) {
    const lh = syncedSettingsHash(local.settings);
    const rh = syncedSettingsHash(remote.settings);
    const verdict = trioVerdict({ baseHash: meta.base?.settings, localHash: lh, remoteHash: rh });
    let side: "local" | "remote" = verdict === "remote" ? "remote" : "local";
    if (verdict === "conflict") {
      const forced = resolutions["settings"];
      // 按「较新变更胜」；平局（如双方都是升级前的旧数据，均无时间戳）按设备号确定性裁决——
      // 同一对设备在双方视角下必然收敛到同一侧，不会来回翻转
      const lu = local.settings.updatedAt ?? 0;
      const ru = (remote.settings as AppSettings).updatedAt ?? 0;
      const byTime = lu !== ru ? (lu > ru ? "local" : "remote") : meta.localDeviceId >= meta.remoteDeviceId ? "local" : "remote";
      side = forced ?? byTime;
      conflicts.push({ entityKey: "settings", kind: "settings", label: "应用设置", chosen: side, canFlip: forced === undefined });
    }
    if (side === "remote") {
      // 远端包可能来自旧版本（其中仍带 theme/accent）——防御性剔除后再叠加本机外观，外观永不跨设备覆盖
      const remoteCore: Partial<AppSettings> = { ...remote.settings };
      delete remoteCore.theme;
      delete remoteCore.accent;
      delete remoteCore.lastBookId;
      settings = {
        ...(remoteCore as AppSettings),
        ...pickLocalSettings(local.settings),
        lastBookId: local.settings.lastBookId,
      };
    }
  }

  // ---- lookupSources ----
  const localSrc = new Map<string, LookupSourceConfig>(local.lookupSources.map((s) => [s.id, s]));
  const outSrc: LookupSourceConfig[] = [...local.lookupSources];
  for (const rs of remote.lookupSources ?? []) {
    const ls = localSrc.get(rs.id);
    const tomb = tombByKey.get(`lookupSource::${rs.id}`);
    if (tomb) {
      const idx = outSrc.findIndex((s) => s.id === rs.id);
      if (idx >= 0) outSrc.splice(idx, 1);
      continue;
    }
    if (!ls) {
      outSrc.push(rs);
      continue;
    }
    const verdict = trioVerdict({
      baseHash: meta.base?.lookupSources[rs.id],
      localHash: quickHash(ls),
      remoteHash: quickHash(rs),
    });
    if (verdict === "remote" || verdict === "conflict") {
      if (verdict === "conflict") {
        const key = `lookupSource:${rs.id}`;
        const forced = resolutions[key];
        const chosen: "local" | "remote" = forced ?? "remote";
        conflicts.push({ entityKey: key, kind: "lookupSource", label: rs.label, chosen, canFlip: forced === undefined });
        if (chosen === "local") continue;
      }
      const idx = outSrc.findIndex((s) => s.id === rs.id);
      if (idx >= 0) outSrc[idx] = rs;
    }
  }
  // 本地墓碑对本地源的即刻删除（来自 meta.tombstones，不在 remote 里出现）
  const outSrcFiltered = outSrc.filter((s) => !tombByKey.has(`lookupSource::${s.id}`));

  // ---- exportPresets（与 lookupSources 同规则：按 id 三方指纹 + 墓碑；远端缺省视为未提供，不删本地） ----
  const outPresets: ExportPreset[] = [...(local.exportPresets ?? [])];
  for (const rp of remote.exportPresets ?? []) {
    if (tombByKey.has(`exportPreset::${rp.id}`)) {
      const idx = outPresets.findIndex((p) => p.id === rp.id);
      if (idx >= 0) outPresets.splice(idx, 1);
      continue;
    }
    const lp = outPresets.find((p) => p.id === rp.id);
    if (!lp) {
      outPresets.push(rp);
      continue;
    }
    const verdict = trioVerdict({
      baseHash: meta.base?.exportPresets?.[rp.id],
      localHash: quickHash(lp),
      remoteHash: quickHash(rp),
    });
    if (verdict === "remote" || verdict === "conflict") {
      if (verdict === "conflict") {
        const key = `exportPreset:${rp.id}`;
        const forced = resolutions[key];
        const chosen: "local" | "remote" = forced ?? "remote";
        conflicts.push({ entityKey: key, kind: "exportPreset", label: rp.name, chosen, canFlip: forced === undefined });
        if (chosen === "local") continue;
      }
      const idx = outPresets.findIndex((p) => p.id === rp.id);
      if (idx >= 0) outPresets[idx] = rp;
    }
  }
  const outPresetsFiltered = outPresets.filter((p) => !tombByKey.has(`exportPreset::${p.id}`));

  // ---- dictionaries（importedAt 新者胜；删除墓碑同理） ----
  const localDict = new Map<string, LocalDictMeta>(local.dictionaries.map((d) => [d.id, d]));
  const outDict: LocalDictMeta[] = [...local.dictionaries];
  for (const rd of remote.dictionaries ?? []) {
    if (tombByKey.has(`lookupSource::dict:${rd.id}`)) continue;
    const ld = localDict.get(rd.id);
    if (!ld) {
      outDict.push(rd);
      continue;
    }
    const lAt = (ld as LocalDictMeta & { importedAt?: number }).importedAt ?? 0;
    const rAt = (rd as LocalDictMeta & { importedAt?: number }).importedAt ?? 0;
    if (rAt > lAt) {
      const idx = outDict.findIndex((d) => d.id === rd.id);
      if (idx >= 0) outDict[idx] = rd;
    }
  }

  const state: SyncState = {
    books: outBooks,
    settings,
    lookupSources: outSrcFiltered,
    dictionaries: outDict,
    exportPresets: outPresetsFiltered,
  };

  conflicts.sort((a, b) => (a.entityKey < b.entityKey ? -1 : a.entityKey > b.entityKey ? 1 : 0));

  return {
    state,
    conflicts,
    applied,
    nextBase: computeBaseHashes(state),
    nextTombstones,
  };
}

function mergeAllTombstones(list: SyncTombstone[]): SyncTombstone[] {
  const map = new Map<string, SyncTombstone>();
  for (const t of list) {
    const key = `${t.kind}:${t.bookId ?? ""}:${t.id}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    if (t.deletedAt > prev.deletedAt || (t.deletedAt === prev.deletedAt && t.deviceId > prev.deviceId)) {
      map.set(key, t);
    }
  }
  return [...map.values()];
}
