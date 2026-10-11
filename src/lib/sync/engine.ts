/**
 * Gist 自动同步引擎（P1）
 * ------------------------------------------------------------
 * - 单飞：同一时刻只有一个同步在跑（模块级 Promise 互斥）；
 * - 流程：读配置 → 拉远端密文 → 配对码解密 → 三方合并（base 快照）→ 安全快照 → 落库 → 推送本端快照；
 * - 本端上轮推送内容未变（指纹相同）则跳过推送，省 Gist 修订；
 * - store 依赖注入（不 import store）：引擎保持可测、UI 层负责接线；
 * - 状态经模块级订阅广播（UI 徽标），不进主 store。
 */

import { hlcNow, hlcToString } from "./clock";
import { buildEncryptedEnvelope, buildSyncPayload, parseEnvelopeWithCode, quickHash, serializeEnvelope } from "./pack";
import { loadSyncMeta, saveSyncMeta, writeSafetySnapshot } from "./meta";
import { mergeSync } from "./merge";
import { gistFind, gistPull, gistPush, type GistCandidate } from "./transports/gist";
import { isPairCodeWellFormed } from "./crypto";
import type { MergeApplied, SyncState } from "./types";

export type SyncPhase = "off" | "idle" | "syncing" | "ok" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  message?: string;
  at: number | null;
}

/**
 * 引擎共享状态挂 globalThis（跨模块副本单例）：status / 订阅者 / 单飞锁。
 * Turbopack（dev）可能产生多实例——若各持一份，「状态广播收不到」「单飞失效并发跑」
 * 都会出现（依赖注册丢失即此因之一，见 auto.ts 注释）。
 */
interface EngineGlobal {
  status: SyncStatus;
  listeners: Set<(s: SyncStatus) => void>;
  inFlight: Promise<SyncOutcome> | null;
}

const GE = globalThis as unknown as { __wvSyncEngine?: EngineGlobal };
const st = (GE.__wvSyncEngine ??= { status: { phase: "off", at: null }, listeners: new Set(), inFlight: null });

export function getSyncStatus(): SyncStatus {
  return st.status;
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  st.listeners.add(fn);
  return () => st.listeners.delete(fn);
}

function setStatus(next: SyncStatus): void {
  st.status = next;
  for (const fn of st.listeners) fn(st.status);
}

/** UI 在「已配置但还没同步」时调用，让徽标从「未开启」过渡到「待同步」 */
export function markSyncIdle(): void {
  if (st.status.phase === "syncing") return;
  setStatus({ phase: "idle", at: st.status.at });
}

export function markSyncOff(): void {
  if (st.status.phase === "syncing") return;
  setStatus({ phase: "off", at: st.status.at });
}

export interface SyncDeps {
  getState: () => SyncState;
  applyState: (s: SyncState) => void;
}

export interface SyncOutcome {
  pulled: boolean;
  pushed: boolean;
  applied: MergeApplied | null;
  /** 本轮合并发现的冲突数（已按较新一侧自动保留） */
  conflicts?: number;
  /** 因退避策略被跳过（自动同步路径） */
  skipped?: boolean;
}

/** 失败退避：1m → 5m → 30m → 2h（按连续失败次数） */
export function backoffDelayMs(streak: number): number {
  const steps = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
  return steps[Math.min(Math.max(streak - 1, 0), steps.length - 1)];
}

/** 跑一轮完整同步（拉 → 合并 → 推）。并发调用共享同一轮；manual 绕过退避。 */
export function runGistSync(deps: SyncDeps, opts: { manual?: boolean } = {}): Promise<SyncOutcome> {
  if (st.inFlight) return st.inFlight;
  const task = runOnce(deps, opts.manual === true).finally(() => {
    st.inFlight = null;
  });
  st.inFlight = task;
  return task;
}

async function runOnce(deps: SyncDeps, manual: boolean): Promise<SyncOutcome> {
  const meta = await loadSyncMeta();
  const cfg = meta.gist;
  if (!cfg?.token) throw new Error("还没配置 GitHub Token，打开「同步向导」看一眼就会");
  if (!cfg.pairCode || !isPairCodeWellFormed(cfg.pairCode)) {
    throw new Error("配对码还没就绪，在「自动同步」里生成一个，或粘贴另一台设备的配对码");
  }
  if (!manual && cfg.backoffUntil && Date.now() < cfg.backoffUntil) {
    return { pulled: false, pushed: false, applied: null, skipped: true };
  }

  setStatus({ phase: "syncing", at: Date.now(), message: "正在同步…" });
  try {
    // 1) 拉取远端并合并
    let pulled = false;
    let applied: MergeApplied | null = null;
    let conflicts = 0;
    let remoteFiles: string[] | undefined;
    let remoteRevision: string | null = null;

    let remote = null as Awaited<ReturnType<typeof gistPull>> | null;
    if (cfg.gistId) {
      try {
        remote = await gistPull(cfg);
      } catch (e) {
        // 自家中转站被删也不致命：走发现逻辑另寻/新建（其余错误照常上抛）
        if (!/找不到同步仓库/.test((e as Error).message)) throw e;
      }
    }
    let parsed = remote ? await parseEnvelopeWithCode(remote.text, cfg.pairCode) : null;

    // 中转站发现 / 认领：账号内同一配对共用同一个 Gist。
    // 三端实测缺陷：旧版各端首同步都 POST 新建自己的 Gist、gistId 从不共享，
    // 每台设备都在和自己的私有中转站对话（配对也永不相遇）。认领一律经「拉取 + 配对码解密验证」。
    const candidates = await gistFind(cfg).catch((): GistCandidate[] => []);
    const adopt = async (id: string): Promise<boolean> => {
      try {
        const r = await gistPull({ ...cfg, gistId: id });
        if (!r) return false;
        const p = await parseEnvelopeWithCode(r.text, cfg.pairCode); // 解不开 = 不是本配对的中转站
        remote = r;
        parsed = p;
        await saveSyncMeta({ gist: { ...cfg, gistId: id } });
        return true;
      } catch {
        return false;
      }
    };
    if (!remote) {
      // 无本地站（新设备）或自家站已失效：认领任一「能解密」的候选（候选按最新优先）
      for (const cand of candidates) {
        if (cand.id === cfg.gistId) continue;
        if (await adopt(cand.id)) break;
      }
    } else {
      const ownTagged = candidates.find((c) => c.id === cfg.gistId)?.exact ?? false;
      // 常规收敛：切换到「同为本配对标识、且比自己更新」的中转站
      const exactBetter = candidates.find((c) => c.exact && c.id !== cfg.gistId && c.updatedAt > remote!.revision);
      if (exactBetter) {
        await adopt(exactBetter.id);
      } else if (!ownTagged) {
        // 迁移窗口：自己的站还是旧描述（升级后尚未推送过）→ 认领首批「能解密」的他站（含同样是旧描述的站）
        for (const cand of candidates) {
          if (cand.id === cfg.gistId) continue;
          if (await adopt(cand.id)) break;
        }
      }
    }

    if (remote && parsed) {
      remoteFiles = remote.fileNames;
      remoteRevision = remote.revision;
      const { envelope, payload } = parsed;
      if (envelope.deviceId !== meta.device.id) {
        const res = mergeSync({
          local: deps.getState(),
          remote: payload,
          meta: {
            base: meta.base,
            lastSyncAt: meta.lastSyncAt,
            localDeviceId: meta.device.id,
            remoteDeviceId: payload.deviceId,
            tombstones: meta.tombstones,
            now: Date.now(),
          },
        });
        await writeSafetySnapshot(JSON.stringify({ state: deps.getState(), tombstones: meta.tombstones, at: Date.now() }));
        deps.applyState(res.state);
        await saveSyncMeta({ base: res.nextBase, tombstones: res.nextTombstones, lastSyncAt: Date.now() });
        pulled = true;
        applied = res.applied;
        conflicts = res.conflicts.length;
      }
    }

    // 2) 推送本端快照（内容与上轮相同则跳过）
    const fresh = await loadSyncMeta();
    const current = fresh.gist ?? cfg;
    const payload = buildSyncPayload(deps.getState(), {
      mode: "snapshot",
      deviceId: fresh.device.id,
      tombstones: fresh.tombstones,
    });
    const payloadHash = quickHash(payload);
    let pushed = false;
    if (current.lastPushHash !== payloadHash || !current.gistId) {
      const envelope = await buildEncryptedEnvelope(payload, {
        deviceId: fresh.device.id,
        hlcString: hlcToString(hlcNow(null, fresh.device.id)),
        pairCode: current.pairCode,
        baseCursor: remoteRevision,
      });
      const res = await gistPush(current, serializeEnvelope(envelope), { existingFiles: remoteFiles });
      await saveSyncMeta({
        gist: { ...current, gistId: res.gistId, lastPushHash: payloadHash, failStreak: 0, backoffUntil: null, excludeGistIds: [] },
        lastSyncAt: Date.now(),
      });
      pushed = true;
    } else if (current.failStreak || current.backoffUntil) {
      await saveSyncMeta({
        gist: { ...current, failStreak: 0, backoffUntil: null },
        lastSyncAt: Date.now(),
      });
    } else {
      await saveSyncMeta({ lastSyncAt: Date.now() });
    }

    setStatus({
      phase: "ok",
      at: Date.now(),
      message: conflicts
        ? `同步完成 · ${conflicts} 处冲突按较新保留`
        : pushed || pulled
          ? "同步完成"
          : "已经是最新",
    });
    return { pulled, pushed, applied, conflicts };
  } catch (e) {
    const message = (e as Error).message || "同步失败";
    try {
      const streak = (cfg.failStreak ?? 0) + 1;
      await saveSyncMeta({ gist: { ...cfg, failStreak: streak, backoffUntil: Date.now() + backoffDelayMs(streak) } });
    } catch {
      /* 退避记录失败不阻碍报错 */
    }
    setStatus({ phase: "error", at: Date.now(), message });
    throw e;
  }
}
