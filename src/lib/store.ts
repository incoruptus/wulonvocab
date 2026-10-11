import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import type {
  AppSettings,
  Entry,
  EntryStatus,
  ExportPreset,
  ExportSettings,
  LocalDictMeta,
  LookupSourceConfig,
  SectionDef,
  SectionOptions,
  SectionType,
  Wordbook,
} from "./types";
import { normalizeExportSettings } from "./export/themes";
import type { MakeSectionInput } from "./sections";
import { makeSection, sortSections, uniqueKey } from "./sections";
import { createEmptyBook, createSampleBook as buildSampleBook, defaultExportSettings, getPreset } from "./presets";
import { mergeDuplicateEntries } from "./importer";
import { applyGrade, deriveStatusFromSrs, isNewSrs, type GradeValue } from "./study/engine";
import { studyConfigOf } from "./study/queue";
import { emptyDailyLog, pruneDaily, ymd, type StudyConfig, type StudySrs } from "./study/types";
import { clearTombstonesFor, recordTombstones } from "./sync/meta";
import { requestSyncNow, requestSyncSoon } from "./sync/auto";
import { hasSyncedSettingChange, pickLocalSettings } from "./sync/types";
import type { SyncState, SyncTombstone } from "./sync/types";
import { historyOf, withHistory } from "./history";
import { uid } from "./utils";

/* ============================================================
   持久化：IndexedDB + 防抖写入（词库体积大时 localStorage 不够）
   ============================================================ */

const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeFailureNotified = false;

function flushWrites() {
  flushTimer = null;
  if (!pending.size) return;
  const jobs: Promise<boolean>[] = [];
  for (const [name, value] of pending) {
    jobs.push(
      idbSet(name, value).then(
        () => true,
        (e) => {
          // 配额/隐私模式等写入失败不再静默：控制台 + 事件（UI 可监听提示一次）
          console.error("[wulonvocab] 本地写入失败：", e);
          if (!writeFailureNotified) {
            writeFailureNotified = true;
            try {
              window.dispatchEvent(new CustomEvent("wulonvocab:persist-error"));
            } catch {
              /* ignore */
            }
          }
          return false;
        },
      ),
    );
  }
  pending.clear();
  // 多标签页同步：写入成功后广播，其它空闲标签页自行 rehydrate
  if (typeof window !== "undefined") {
    void Promise.all(jobs).then((rs) => {
      if (rs.some(Boolean)) tabChannel?.postMessage({ type: "state-updated" });
    });
  }
}

function scheduleWrite(name: string, value: string) {
  pending.set(name, value);
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushWrites, 400);
}

/** 关键写入（学习评分等）即时落盘，不等防抖 */
function flushSoon() {
  if (flushTimer) clearTimeout(flushTimer);
  flushWrites();
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrites();
  });
  // pagehide 是移动端最可靠的“离开页面”信号（beforeunload 在 iOS 常不触发）
  window.addEventListener("pagehide", flushWrites);
  window.addEventListener("beforeunload", flushWrites);
}

const idbStorage: StateStorage = {
  getItem: async (name) => {
    const v = await idbGet<string>(name);
    return v ?? null;
  },
  setItem: (name, value) => {
    scheduleWrite(name, value);
  },
  removeItem: async (name) => {
    pending.delete(name);
    await idbDel(name);
  },
};

/* ============================================================
   默认值
   ============================================================ */

export const DEFAULT_LOOKUP_SOURCES: LookupSourceConfig[] = [
  {
    id: "zerodict",
    kind: "zerodict",
    label: "网络综合词典（零配置·中英）",
    enabled: true,
    config: {},
  },
  {
    id: "freedict",
    kind: "freedict",
    label: "Free Dictionary API（上游长期故障，不推荐）",
    enabled: false,
    config: {},
  },
  {
    id: "localdict",
    kind: "localdict",
    label: "本地词库",
    enabled: true,
    config: {},
  },
  {
    id: "youdao",
    kind: "youdao",
    label: "有道词典（完整中文·需代理）",
    enabled: false,
    config: { proxyPrefix: "" },
  },
  {
    id: "ai",
    kind: "ai",
    label: "AI 生成（OpenAI 兼容）",
    enabled: false,
    config: {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "",
      language: "中文",
    },
  },
  {
    id: "http",
    kind: "http",
    label: "自定义 HTTP API",
    enabled: false,
    config: {
      urlTemplate: "",
      method: "GET",
      headers: "{}",
      resultPath: "",
      mapping: "{}",
    },
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  accent: "blue",
  uiScale: 1,
  sidebarCollapsed: false,
  lastBookId: null,
  updatedAt: 0,
};

/* ============================================================
   Store
   ============================================================ */

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface AppStore {
  hydrated: boolean;
  books: Wordbook[];
  settings: AppSettings;
  lookupSources: LookupSourceConfig[];
  dictionaries: LocalDictMeta[];

  setHydrated: (v: boolean) => void;

  // 词库
  createBook: (name: string, schemaId?: string) => Wordbook;
  addSampleBook: () => Wordbook;
  deleteBook: (id: string) => void;
  duplicateBook: (id: string) => Wordbook | null;
  updateBook: (id: string, patch: Partial<Pick<Wordbook, "name" | "description" | "tags" | "meta">>) => void;
  replaceBook: (book: Wordbook) => void;
  setLastBook: (id: string | null) => void;

  // Schema（动态字段）
  addSection: (bookId: string, input: MakeSectionInput) => SectionDef | null;
  updateSection: (
    bookId: string,
    sectionId: string,
    patch: Partial<Omit<SectionDef, "id" | "options">> & { options?: Partial<SectionOptions> },
  ) => void;
  removeSection: (bookId: string, sectionId: string) => void;
  moveSection: (bookId: string, fromIndex: number, toIndex: number) => void;
  duplicateSection: (bookId: string, sectionId: string) => void;
  applyPreset: (bookId: string, presetId: string, mode: "replace" | "merge") => void;
  promoteField: (bookId: string, key: string, type: SectionType, label?: string) => void;
  renameSectionKey: (bookId: string, sectionId: string, newKey: string) => boolean;

  // 词条
  addEntry: (bookId: string, init?: Partial<Entry>) => Entry | null;
  updateEntry: (bookId: string, entryId: string, patch: Partial<Entry>) => void;
  setEntryValue: (bookId: string, entryId: string, key: string, value: unknown) => void;
  removeEntries: (bookId: string, ids: string[]) => void;
  duplicateEntry: (bookId: string, entryId: string) => void;
  toggleStar: (bookId: string, entryId: string) => void;
  setEntryStatus: (bookId: string, entryId: string, status: EntryStatus) => void;
  appendEntries: (bookId: string, entries: Entry[]) => void;
  replaceEntries: (bookId: string, entries: Entry[]) => void;
  /** 批量：设置学习状态（「未学」会清除 srs 进度） */
  setEntriesStatus: (bookId: string, ids: string[], status: EntryStatus) => void;
  /** 批量：增删标签 */
  updateEntriesTags: (bookId: string, ids: string[], add: string[], remove: string[]) => void;
  /** 批量：星标 */
  setEntriesStarred: (bookId: string, ids: string[], starred: boolean) => void;
  /** 按原位置恢复被删除的词条（撤销删除） */
  restoreEntries: (bookId: string, items: { entry: Entry; index: number }[]) => void;

  // 学习（SRS）
  /** 学习参数：同步域改动会立即上云，返回云端确认 Promise（用于控件加载态） */
  setStudyConfig: (bookId: string, patch: Partial<StudyConfig>) => Promise<boolean> | null;
  applyReview: (
    bookId: string,
    entryId: string,
    rating: GradeValue,
    elapsedMs: number,
    nowMs?: number,
  ) => { before: StudySrs | undefined; next: StudySrs; dayKey: string } | null;
  undoReview: (
    bookId: string,
    entryId: string,
    before: StudySrs | undefined,
    rating: GradeValue,
    elapsedMs: number,
    /** 与 applyReview 返回的 dayKey 一致（跨午夜撤销不错记） */
    dayKey?: string,
  ) => void;
  resetEntrySrs: (bookId: string, entryId: string) => void;

  // 导出设置
  updateExportSettings: (bookId: string, patch: DeepPartial<ExportSettings>) => void;
  resetExportSettings: (bookId: string) => void;

  // 导出预设（全局命名方案；随跨端同步）
  exportPresets: ExportPreset[];
  saveExportPreset: (name: string, settings: ExportSettings) => string;
  updateExportPreset: (id: string, patch: { name?: string; settings?: ExportSettings }) => void;
  removeExportPreset: (id: string) => void;
  /** 撤销删除：按原 id 恢复并清墓碑 */
  restoreExportPreset: (preset: ExportPreset) => void;

  // 检索源
  addLookupSource: (source: Omit<LookupSourceConfig, "id">) => Promise<boolean> | null;
  updateLookupSource: (id: string, patch: Partial<Omit<LookupSourceConfig, "config">> & { config?: Record<string, string> }) => Promise<boolean> | null;
  removeLookupSource: (id: string) => Promise<boolean> | null;
  /** 跨端同步：合并结果落库（lastBookId 保持本机值） */
  applySyncState: (next: SyncState) => void;
  /** 全局撤销/重做（内容域：词库/词条/数据源/预设；评分与同步合并不入历史） */
  undoHistory: () => void;
  redoHistory: () => void;
  /** 数据迁移：补齐新版本新增的默认数据源（不覆盖用户已有配置） */
  ensureLookupSources: () => void;

  // 本地词典
  addDictionary: (meta: LocalDictMeta) => void;
  removeDictionary: (id: string) => void;

  // 应用设置
  setSettings: (patch: Partial<AppSettings>) => Promise<boolean> | null;

  // 备份
  exportBackupJson: () => string;
  importBackupJson: (json: string) => { ok: boolean; error?: string; books?: number; warnings?: string[] };
}

function patchBook(books: Wordbook[], id: string, fn: (book: Wordbook) => Wordbook): Wordbook[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: Date.now() } : b));
}

/** 预设落库前的净化：规范化设置并剥掉「书籍专属」的封面题名（套用到别的词库时自动回退为词库名） */
function sanitizePresetSettings(s: ExportSettings): ExportSettings {
  const n = normalizeExportSettings(s);
  return { ...n, cover: { ...n.cover, title: "" } };
}

/**
 * 撤销/重做后的墓碑对齐（跨端语义同删除动作一致）：
 * - 恢复出来的书/词/数据源/预设（当前没有的）→ 清除其墓碑；
 * - 被撤销掉的书/词/数据源/预设（恢复后没有的）→ 补写墓碑；
 * 书籍删除与既有 deleteBook 同粒度（只写 book 墓碑，不逐词写 entry）。
 */
async function alignTombstones(restored: Record<string, unknown>, replaced: Record<string, unknown>): Promise<void> {
  const ids = (snap: Record<string, unknown>) => {
    const books = (snap.books ?? []) as Wordbook[];
    const bookIds = new Set(books.map((b) => b.id));
    const entries = new Map<string, Set<string>>();
    for (const b of books) entries.set(b.id, new Set(b.entries.map((e) => e.id)));
    const sourceIds = new Set(((snap.lookupSources ?? []) as LookupSourceConfig[]).map((s) => s.id));
    const presetIds = new Set(((snap.exportPresets ?? []) as ExportPreset[]).map((p) => p.id));
    return { bookIds, entries, sourceIds, presetIds };
  };
  try {
    const a = ids(restored);
    const b = ids(replaced);
    const at = Date.now();
    const dead: Array<Omit<SyncTombstone, "deviceId">> = [];
    const back: Array<{ kind: SyncTombstone["kind"]; id: string; bookId?: string }> = [];
    for (const id of b.bookIds) if (!a.bookIds.has(id)) dead.push({ kind: "book", id, deletedAt: at });
    for (const id of a.bookIds) if (!b.bookIds.has(id)) back.push({ kind: "book", id });
    for (const [bid, setB] of b.entries) {
      const setA = a.entries.get(bid);
      if (!setA) continue; // 整书都不见了，book 墓碑已覆盖
      for (const eid of setB) if (!setA.has(eid)) dead.push({ kind: "entry", id: eid, bookId: bid, deletedAt: at });
      for (const eid of setA) if (!setB.has(eid)) back.push({ kind: "entry", id: eid, bookId: bid });
    }
    for (const id of b.sourceIds) if (!a.sourceIds.has(id)) dead.push({ kind: "lookupSource", id, deletedAt: at });
    for (const id of a.sourceIds) if (!b.sourceIds.has(id)) back.push({ kind: "lookupSource", id });
    for (const id of b.presetIds) if (!a.presetIds.has(id)) dead.push({ kind: "exportPreset", id, deletedAt: at });
    for (const id of a.presetIds) if (!b.presetIds.has(id)) back.push({ kind: "exportPreset", id });
    if (dead.length) await recordTombstones(dead);
    if (back.length) await clearTombstonesFor(back);
  } catch {
    /* 墓碑对齐失败不影响撤销本身 */
  }
}

function mergeExportSettings(prev: ExportSettings, patch: DeepPartial<ExportSettings>): ExportSettings {  return {
    ...prev,
    ...(patch as Partial<ExportSettings>),
    margin: { ...prev.margin, ...(patch.margin ?? {}) },
    grid: { ...prev.grid, ...(patch.grid ?? {}) },
    cover: { ...prev.cover, ...(patch.cover ?? {}) },
    index: { ...prev.index, ...(patch.index ?? {}) },
    footer: { ...prev.footer, ...(patch.footer ?? {}) },
    sectionVisibility: { ...prev.sectionVisibility, ...((patch.sectionVisibility ?? {}) as Record<string, boolean>) },
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    withHistory<AppStore>(
      (set, get, api) => ({
      hydrated: false,
      books: [],
      settings: DEFAULT_SETTINGS,
      lookupSources: DEFAULT_LOOKUP_SOURCES,
      dictionaries: [],
      exportPresets: [],

      setHydrated: (v) => set({ hydrated: v }),

      createBook: (name, schemaId) => {
        const preset = getPreset(schemaId);
        const book = createEmptyBook(name.trim() || "未命名词库", preset?.build());
        set((s) => ({ books: [book, ...s.books], settings: { ...s.settings, lastBookId: book.id } }));
        return book;
      },

      addSampleBook: () => {
        const book = buildSampleBook();
        set((s) => ({ books: [book, ...s.books], settings: { ...s.settings, lastBookId: book.id } }));
        return book;
      },

      deleteBook: (id) => {
        set((s) => ({
          books: s.books.filter((b) => b.id !== id),
        }));
        // 跨端同步墓碑（fire-and-forget；失败不影响删除本身）
        void recordTombstones([{ kind: "book", id, deletedAt: Date.now() }]);
      },

      duplicateBook: (id) => {
        const src = get().books.find((b) => b.id === id);
        if (!src) return null;
        const copy: Wordbook = {
          ...src,
          id: uid(),
          name: `${src.name}（副本）`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          schema: { ...src.schema, sections: src.schema.sections.map((s) => ({ ...s, id: uid() })) },
          entries: src.entries.map((e) => ({ ...e, id: uid(), createdAt: Date.now(), updatedAt: Date.now() })),
        };
        set((s) => ({ books: [copy, ...s.books], settings: { ...s.settings, lastBookId: copy.id } }));
        return copy;
      },

      updateBook: (id, patch) => set((s) => ({ books: patchBook(s.books, id, (b) => ({ ...b, ...patch })) })),

      replaceBook: (book) =>
        set((s) => ({
          books: s.books.some((b) => b.id === book.id)
            ? s.books.map((b) => (b.id === book.id ? book : b))
            : [book, ...s.books],
          settings: { ...s.settings, lastBookId: book.id },
        })),

      setLastBook: (id) => set((s) => ({ settings: { ...s.settings, lastBookId: id } })),

      addSection: (bookId, input) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return null;
        const existing = book.schema.sections.map((s) => s.key);
        const section = makeSection({
          ...input,
          key: uniqueKey(input.key ?? input.type, existing),
          order: book.schema.sections.length,
        });
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            schema: { ...b.schema, sections: sortSections([...b.schema.sections, section]) },
          })),
        }));
        return section;
      },

      updateSection: (bookId, sectionId, patch) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            schema: {
              ...b.schema,
              sections: b.schema.sections.map((sec) =>
                sec.id === sectionId
                  ? {
                      ...sec,
                      ...patch,
                      options: { ...sec.options, ...(patch.options ?? {}) },
                    }
                  : sec,
              ),
            },
          })),
        })),

      removeSection: (bookId, sectionId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            schema: {
              ...b.schema,
              sections: sortSections(b.schema.sections.filter((sec) => sec.id !== sectionId)).map((sec, i) => ({
                ...sec,
                order: i,
              })),
            },
          })),
        })),

      moveSection: (bookId, fromIndex, toIndex) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const sections = sortSections(b.schema.sections);
            if (fromIndex < 0 || fromIndex >= sections.length) return b;
            const next = [...sections];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved);
            return { ...b, schema: { ...b.schema, sections: next.map((sec, i) => ({ ...sec, order: i })) } };
          }),
        })),

      duplicateSection: (bookId, sectionId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const src = b.schema.sections.find((sec) => sec.id === sectionId);
            if (!src) return b;
            const copy: SectionDef = {
              ...src,
              id: uid(),
              key: uniqueKey(`${src.key}_copy`, b.schema.sections.map((x) => x.key)),
              label: `${src.label}（副本）`,
              order: b.schema.sections.length,
            };
            return { ...b, schema: { ...b.schema, sections: [...b.schema.sections, copy] } };
          }),
        })),

      applyPreset: (bookId, presetId, mode) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const preset = getPreset(presetId);
            if (!preset) return b;
            const next = preset.build();
            if (mode === "replace") {
              return { ...b, schema: next };
            }
            const existingKeys = new Set(b.schema.sections.map((sec) => sec.key));
            const merged = [
              ...b.schema.sections,
              ...next.sections
                .filter((sec) => !existingKeys.has(sec.key))
                .map((sec) => ({ ...sec, id: uid() })),
            ].map((sec, i) => ({ ...sec, order: i }));
            return { ...b, schema: { ...b.schema, sections: merged } };
          }),
        })),

      promoteField: (bookId, key, type, label) => {
        get().addSection(bookId, { type, key, label: label || key, description: "由导入数据 / 检索结果提升为字段" });
      },

      renameSectionKey: (bookId, sectionId, newKey) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return false;
        const section = book.schema.sections.find((sec) => sec.id === sectionId);
        if (!section || section.key === newKey) return true;
        if (!newKey.trim()) return false;
        if (book.schema.sections.some((sec) => sec.key === newKey && sec.id !== sectionId)) return false;
        // 词条里存在同名「未提升」的 extras 键时拒绝：否则重命名会静默覆盖用户数据
        const extrasConflict = book.entries.some(
          (e) =>
            Object.prototype.hasOwnProperty.call(e.values, newKey) &&
            !book.schema.sections.some((sec) => sec.key === newKey),
        );
        if (extrasConflict) return false;
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            schema: {
              ...b.schema,
              sections: b.schema.sections.map((sec) => (sec.id === sectionId ? { ...sec, key: newKey } : sec)),
            },
            entries: b.entries.map((e) => {
              if (!(section.key in e.values)) return e;
              const values = { ...e.values };
              values[newKey] = values[section.key];
              delete values[section.key];
              return { ...e, values, updatedAt: Date.now() };
            }),
          })),
        }));
        return true;
      },

      addEntry: (bookId, init) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return null;
        const now = Date.now();
        const entry: Entry = {
          id: uid(),
          headword: (init?.headword ?? "").trim(),
          tags: init?.tags ?? [],
          status: init?.status ?? "new",
          starred: init?.starred ?? false,
          values: init?.values ?? {},
          createdAt: now,
          updatedAt: now,
          source: init?.source ?? { kind: "manual", at: now },
        };
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({ ...b, entries: [entry, ...b.entries] })),
        }));
        return entry;
      },

      updateEntry: (bookId, entryId, patch) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => (e.id === entryId ? { ...e, ...patch, updatedAt: Date.now() } : e)),
          })),
        })),

      setEntryValue: (bookId, entryId, key, value) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) =>
              e.id === entryId ? { ...e, values: { ...e.values, [key]: value }, updatedAt: Date.now() } : e,
            ),
          })),
        })),

      removeEntries: (bookId, ids) => {
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({ ...b, entries: b.entries.filter((e) => !ids.includes(e.id)) })),
        }));
        const deletedAt = Date.now();
        void recordTombstones(ids.map((id) => ({ kind: "entry" as const, id, bookId, deletedAt })));
      },

      duplicateEntry: (bookId, entryId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const src = b.entries.find((e) => e.id === entryId);
            if (!src) return b;
            const copy: Entry = {
              ...src,
              id: uid(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              values: JSON.parse(JSON.stringify(src.values)) as Record<string, unknown>,
            };
            const idx = b.entries.findIndex((e) => e.id === entryId);
            const entries = [...b.entries];
            entries.splice(idx + 1, 0, copy);
            return { ...b, entries };
          }),
        })),

      toggleStar: (bookId, entryId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => (e.id === entryId ? { ...e, starred: !e.starred, updatedAt: Date.now() } : e)),
          })),
        })),

      setEntryStatus: (bookId, entryId, status) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => (e.id === entryId ? { ...e, status, updatedAt: Date.now() } : e)),
          })),
        })),

      appendEntries: (bookId, newEntries) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const merged = mergeDuplicateEntries([...b.entries, ...newEntries]);
            return { ...b, entries: merged };
          }),
        })),

      replaceEntries: (bookId, entries) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({ ...b, entries: mergeDuplicateEntries(entries) })),
        })),

      setEntriesStatus: (bookId, ids, status) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => {
              if (!ids.includes(e.id)) return e;
              if (status === "new") {
                const next = { ...e, status, updatedAt: Date.now() };
                delete next.srs;
                return next;
              }
              return { ...e, status, updatedAt: Date.now() };
            }),
          })),
        })),

      updateEntriesTags: (bookId, ids, add, remove) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => {
              if (!ids.includes(e.id)) return e;
              const removeSet = new Set(remove);
              const tags = [...new Set([...e.tags.filter((t) => !removeSet.has(t)), ...add])];
              return { ...e, tags, updatedAt: Date.now() };
            }),
          })),
        })),

      setEntriesStarred: (bookId, ids, starred) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => (ids.includes(e.id) ? { ...e, starred, updatedAt: Date.now() } : e)),
          })),
        })),

      restoreEntries: (bookId, items) => {
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const entries = [...b.entries];
            const sorted = [...items].sort((a, c) => a.index - c.index);
            for (const { entry, index } of sorted) {
              if (entries.some((e) => e.id === entry.id)) continue;
              entries.splice(Math.min(index, entries.length), 0, entry);
            }
            return { ...b, entries };
          }),
        }));
        // 撤销删除：清除墓碑，防止对端把刚恢复的词条再次删掉
        void clearTombstonesFor(items.map(({ entry }) => ({ kind: "entry" as const, id: entry.id, bookId })));
      },

      setStudyConfig: (bookId, patch) => {
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            study: {
              config: { ...studyConfigOf(b), ...patch },
              daily: b.study?.daily ?? {},
            },
          })),
        }));
        return requestSyncNow(); // 学习参数改动立即上云；返回确认 Promise 供控件加载态
      },

      applyReview: (bookId, entryId, rating, elapsedMs, nowMs) => {
        const endHist = historyOf(api)?.suppress();
        try {
        const now = nowMs ?? Date.now();
        // CAS：在 set 回调内基于最新 srs 重算（同 tick 重复调用不再互相覆盖）
        let outcome: { before: StudySrs | undefined; next: StudySrs; dayKey: string } | null = null;
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          const entry = book?.entries.find((e) => e.id === entryId);
          if (!book || !entry) return {};
          const cfg = studyConfigOf(book);
          const before = entry.srs;
          const next = applyGrade(before, rating, cfg.retention, now);
          const wasNew = isNewSrs(before);
          outcome = { before, next, dayKey: ymd(now) };
          return {
            books: patchBook(s.books, bookId, (b) => {
              const daily = { ...(b.study?.daily ?? {}) };
              const key = ymd(now);
              const log = { ...(daily[key] ?? emptyDailyLog()) };
              log.reviewed += 1;
              log.ms += Math.max(0, elapsedMs);
              if (wasNew) log.added += 1;
              if (rating === 1) log.again += 1;
              else if (rating === 2) log.hard += 1;
              else if (rating === 3) log.good += 1;
              else log.easy += 1;
              daily[key] = log;
              return {
                ...b,
                entries: b.entries.map((e) =>
                  e.id === entryId ? { ...e, srs: next, status: deriveStatusFromSrs(next) } : e,
                ),
                study: { config: b.study?.config ?? cfg, daily: pruneDaily(daily, now) },
              };
            }),
          };
        });
        if (!outcome) return null;
        flushSoon(); // 学习进度即时落盘（不等防抖）
        const picked = outcome as { before: StudySrs | undefined; next: StudySrs; dayKey: string };
        return { before: picked.before, next: picked.next, dayKey: picked.dayKey };
        } finally {
          endHist?.();
        }
      },

      undoReview: (bookId, entryId, before, rating, elapsedMs, dayKey) => {
        const endHist = historyOf(api)?.suppress();
        try {
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const daily = { ...(b.study?.daily ?? {}) };
            // 与 applyReview 同源的日键：跨午夜撤销不会记错日期
            const key = dayKey ?? ymd(Date.now());
            if (daily[key]) {
              const log = { ...daily[key] };
              log.reviewed = Math.max(0, log.reviewed - 1);
              log.ms = Math.max(0, log.ms - Math.max(0, elapsedMs));
              const field = rating === 1 ? "again" : rating === 2 ? "hard" : rating === 3 ? "good" : "easy";
              log[field] = Math.max(0, log[field] - 1);
              if (isNewSrs(before)) log.added = Math.max(0, log.added - 1);
              daily[key] = log;
            }
            return {
              ...b,
              entries: b.entries.map((e) => {
                if (e.id !== entryId) return e;
                if (before) return { ...e, srs: before, status: deriveStatusFromSrs(before) };
                const { srs: _drop, ...rest } = e;
                void _drop;
                return { ...rest, status: "new" as const };
              }),
            };
          }),
        }));
        flushSoon();
        } finally {
          endHist?.();
        }
      },

      resetEntrySrs: (bookId, entryId) => {
        const endHist = historyOf(api)?.suppress();
        try {
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            entries: b.entries.map((e) => {
              if (e.id !== entryId) return e;
              const next = { ...e };
              delete next.srs;
              return { ...next, status: "new" as const };
            }),
          })),
        }));
        } finally {
          endHist?.();
        }
      },

      updateExportSettings: (bookId, patch) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            exportSettings: mergeExportSettings(b.exportSettings, patch),
          })),
        })),

      resetExportSettings: (bookId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            exportSettings: createEmptyBook(b.name).exportSettings,
          })),
        })),

      saveExportPreset: (name, settings) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          exportPresets: [
            ...s.exportPresets,
            { id, name: name.trim() || "未命名预设", settings: sanitizePresetSettings(settings), createdAt: now, updatedAt: now },
          ],
        }));
        requestSyncSoon(10_000); // 预设变更并入同步节奏（10s 防抖，连续调整只推一轮）
        return id;
      },

      updateExportPreset: (id, patch) => {
        set((s) => ({
          exportPresets: s.exportPresets.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...(patch.name !== undefined ? { name: patch.name.trim() || p.name } : {}),
                  ...(patch.settings ? { settings: sanitizePresetSettings(patch.settings) } : {}),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        }));
        requestSyncSoon(10_000);
      },

      removeExportPreset: (id) => {
        set((s) => ({ exportPresets: s.exportPresets.filter((p) => p.id !== id) }));
        void recordTombstones([{ kind: "exportPreset", id, deletedAt: Date.now() }]);
        requestSyncSoon(10_000); // 删除立即安排上云（配合墓碑传播）
      },

      restoreExportPreset: (preset) => {
        set((s) => ({
          exportPresets: s.exportPresets.some((p) => p.id === preset.id) ? s.exportPresets : [...s.exportPresets, preset],
        }));
        void clearTombstonesFor([{ kind: "exportPreset", id: preset.id }]);
        requestSyncSoon(10_000);
      },

      addLookupSource: (source) => {
        set((s) => ({ lookupSources: [...s.lookupSources, { ...source, id: uid() }] }));
        return requestSyncNow(); // 数据源增删是离散设置改动：立即上云
      },

      updateLookupSource: (id, patch) => {
        set((s) => ({
          lookupSources: s.lookupSources.map((src) =>
            src.id === id
              ? { ...src, ...patch, config: patch.config ? { ...src.config, ...patch.config } : src.config }
              : src,
          ),
        }));
        // 开关等离散改动：立即同步（返回确认 Promise）；表单文本编辑：30s 防抖合并（防逐键风暴）
        if (Object.keys(patch).some((k) => k !== "config")) return requestSyncNow();
        requestSyncSoon();
        return null;
      },

      removeLookupSource: (id) => {
        set((s) => ({ lookupSources: s.lookupSources.filter((src) => src.id !== id) }));
        void recordTombstones([{ kind: "lookupSource", id, deletedAt: Date.now() }]);
        return requestSyncNow(); // 删除立即上云（配合墓碑传播）
      },

      /** 跨端同步：把合并结果落库（lastBookId 与设备本地外观保持本机值；其余字段整体替换） */
      applySyncState: (next) => {
        const endHist = historyOf(api)?.suppress(); // 远端合并不进入本地撤销栈
        try {
        set((s) => ({
          books: next.books,
          settings: { ...next.settings, ...pickLocalSettings(s.settings), lastBookId: s.settings.lastBookId },
          lookupSources: next.lookupSources,
          dictionaries: next.dictionaries,
          exportPresets: next.exportPresets ?? [],
        }));
        } finally {
          endHist?.();
        }
      },

      ensureLookupSources: () =>
        set((s) => {
          const existing = new Set(s.lookupSources.map((src) => src.id));
          const missing = DEFAULT_LOOKUP_SOURCES.filter((src) => !existing.has(src.id));
          if (!missing.length) return s;
          return { lookupSources: [...s.lookupSources, ...missing.map((src) => ({ ...src, config: { ...src.config } }))] };
        }),

      addDictionary: (meta) => set((s) => ({ dictionaries: [meta, ...s.dictionaries.filter((d) => d.id !== meta.id)] })),

      removeDictionary: (id) => set((s) => ({ dictionaries: s.dictionaries.filter((d) => d.id !== id) })),

      setSettings: (patch) => {
        if (!hasSyncedSettingChange(patch)) {
          // 外观（明暗/强调色）：纯设备本地偏好——不 bump、不推送、不参与冲突
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          return null;
        }
        set((s) => ({ settings: { ...s.settings, ...patch, updatedAt: Date.now() } }));
        return requestSyncNow(); // 设置变更立即上云；返回确认 Promise 供控件加载态
      },

      exportBackupJson: () => {
        const { books, settings, lookupSources, dictionaries, exportPresets } = get();
        return JSON.stringify(
          {
            format: "wulonvocab-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            books,
            settings,
            lookupSources,
            dictionaries,
            exportPresets,
          },
          null,
          2,
        );
      },

      importBackupJson: (json) => {
        // 整库恢复：不进入撤销栈（先清历史，恢复后从新状态起记）
        const endHist = historyOf(api)?.suppress();
        historyOf(api)?.clear();
        try {
        try {
          const data = JSON.parse(json) as Record<string, unknown>;
          if (data.format !== "wulonvocab-backup" || !Array.isArray(data.books)) {
            return { ok: false, error: "不是有效的 WulonVocab 备份文件" };
          }
          // 结构校验与归一化：畸形词库跳过、重复 id 去重、缺省字段补齐（防后续渲染崩溃）
          const seen = new Set<string>();
          let dropped = 0;
          const books: Wordbook[] = [];
          for (const raw of data.books as unknown[]) {
            const b = raw as Partial<Wordbook>;
            if (
              !b ||
              typeof b !== "object" ||
              typeof b.id !== "string" ||
              typeof b.name !== "string" ||
              !Array.isArray(b.entries) ||
              !b.schema ||
              !Array.isArray((b.schema as { sections?: unknown }).sections)
            ) {
              dropped += 1;
              continue;
            }
            if (seen.has(b.id)) {
              dropped += 1;
              continue;
            }
            seen.add(b.id);
            const entries = (b.entries as unknown[])
              .filter(
                (e): e is Entry =>
                  Boolean(e) &&
                  typeof e === "object" &&
                  typeof (e as Entry).id === "string" &&
                  typeof (e as Entry).headword === "string",
              )
              .map((e) => ({
                ...e,
                tags: Array.isArray(e.tags) ? e.tags : [],
                values: e.values && typeof e.values === "object" ? e.values : {},
              }));
            const exportSettings = mergeExportSettings(
              defaultExportSettings(b.name),
              (b.exportSettings ?? {}) as DeepPartial<ExportSettings>,
            );
            books.push({ ...(b as Wordbook), entries, exportSettings });
          }
          if (!books.length) return { ok: false, error: "备份里没有可用的词库" };
          const rawSources = Array.isArray(data.lookupSources) ? (data.lookupSources as unknown[]) : [];
          const lookupSources = rawSources.filter(
            (s): s is LookupSourceConfig =>
              Boolean(s) && typeof s === "object" && typeof (s as LookupSourceConfig).id === "string",
          );
          const rawDicts = Array.isArray(data.dictionaries) ? (data.dictionaries as unknown[]) : [];
          const dictionaries = rawDicts.filter(
            (d): d is LocalDictMeta =>
              Boolean(d) && typeof d === "object" && typeof (d as LocalDictMeta).id === "string",
          );
          const rawPresets = Array.isArray(data.exportPresets) ? (data.exportPresets as unknown[]) : [];
          const exportPresets: ExportPreset[] = [];
          for (const raw of rawPresets) {
            const p = raw as Partial<ExportPreset>;
            if (!p || typeof p !== "object" || typeof p.id !== "string" || typeof p.name !== "string" || !p.settings) continue;
            exportPresets.push({
              id: p.id,
              name: p.name,
              settings: sanitizePresetSettings(mergeExportSettings(defaultExportSettings(""), p.settings as DeepPartial<ExportSettings>)),
              createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
              updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
            });
          }
          set({
            books,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(typeof data.settings === "object" && data.settings ? (data.settings as Partial<AppSettings>) : {}),
            },
            lookupSources: lookupSources.length ? lookupSources : DEFAULT_LOOKUP_SOURCES,
            dictionaries,
            exportPresets,
          });
          flushSoon();
          return {
            ok: true,
            books: books.length,
            ...(dropped ? { warnings: [`已跳过 ${dropped} 个结构异常或重复的词库`] } : {}),
          };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
        } finally {
          endHist?.();
        }
      },

      undoHistory: () => historyOf(api)?.undo(),
      redoHistory: () => historyOf(api)?.redo(),
    }),
    {
      keys: ["books", "lookupSources", "dictionaries", "exportPresets"],
      limit: 40,
      coalesceMs: 500,
      onRestore: (restored, replaced) => {
        void alignTombstones(restored, replaced).finally(() => requestSyncSoon(10_000));
      },
    },
  ) as never,
    {
      name: "wulonvocab-v1",
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => ({
        books: s.books,
        settings: s.settings,
        lookupSources: s.lookupSources,
        dictionaries: s.dictionaries,
        exportPresets: s.exportPresets,
      }),
    },
  ),
);

/* 选择器 */
export function useActiveBook(id: string | null | undefined): Wordbook | undefined {
  return useAppStore((s) => (id ? s.books.find((b) => b.id === id) : undefined));
}

export function findBook(books: Wordbook[], id: string | null | undefined): Wordbook | undefined {
  return id ? books.find((b) => b.id === id) : undefined;
}

/* ============================================================
   多标签页同步：A 标签页写入成功后广播；空闲标签页防抖 rehydrate
   （本地有未落盘改动时不覆盖，避免互相打架）
   ============================================================ */

let tabChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  tabChannel = new BroadcastChannel("wulonvocab-tabs");
  let rehydrateTimer: ReturnType<typeof setTimeout> | null = null;
  tabChannel.onmessage = (ev: MessageEvent) => {
    if ((ev.data as { type?: string } | null)?.type !== "state-updated") return;
    if (pending.size > 0) return;
    if (rehydrateTimer) clearTimeout(rehydrateTimer);
    rehydrateTimer = setTimeout(() => {
      rehydrateTimer = null;
      void useAppStore.persist.rehydrate();
    }, 500);
  };
}
