import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import type {
  AppSettings,
  Entry,
  EntryStatus,
  ExportSettings,
  LocalDictMeta,
  LookupSourceConfig,
  SectionDef,
  SectionOptions,
  SectionType,
  Wordbook,
} from "./types";
import type { MakeSectionInput } from "./sections";
import { makeSection, sortSections, uniqueKey } from "./sections";
import { createEmptyBook, createSampleBook as buildSampleBook, getPreset } from "./presets";
import { mergeDuplicateEntries } from "./importer";
import { applyGrade, isMastered, isNewSrs, type GradeValue } from "./study/engine";
import { studyConfigOf } from "./study/queue";
import { emptyDailyLog, pruneDaily, ymd, type StudyConfig, type StudySrs } from "./study/types";
import { uid } from "./utils";

/* ============================================================
   持久化：IndexedDB + 防抖写入（词库体积大时 localStorage 不够）
   ============================================================ */

const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushWrites() {
  flushTimer = null;
  for (const [name, value] of pending) {
    void idbSet(name, value).catch(() => {});
  }
  pending.clear();
}

function scheduleWrite(name: string, value: string) {
  pending.set(name, value);
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushWrites, 400);
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrites();
  });
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
    label: "Free Dictionary API",
    enabled: true,
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
  setStudyConfig: (bookId: string, patch: Partial<StudyConfig>) => void;
  applyReview: (
    bookId: string,
    entryId: string,
    rating: GradeValue,
    elapsedMs: number,
    nowMs?: number,
  ) => { before: StudySrs | undefined; next: StudySrs } | null;
  undoReview: (
    bookId: string,
    entryId: string,
    before: StudySrs | undefined,
    rating: GradeValue,
    elapsedMs: number,
  ) => void;
  resetEntrySrs: (bookId: string, entryId: string) => void;

  // 导出设置
  updateExportSettings: (bookId: string, patch: DeepPartial<ExportSettings>) => void;
  resetExportSettings: (bookId: string) => void;

  // 检索源
  addLookupSource: (source: Omit<LookupSourceConfig, "id">) => void;
  updateLookupSource: (id: string, patch: Partial<Omit<LookupSourceConfig, "config">> & { config?: Record<string, string> }) => void;
  removeLookupSource: (id: string) => void;
  /** 数据迁移：补齐新版本新增的默认数据源（不覆盖用户已有配置） */
  ensureLookupSources: () => void;

  // 本地词典
  addDictionary: (meta: LocalDictMeta) => void;
  removeDictionary: (id: string) => void;

  // 应用设置
  setSettings: (patch: Partial<AppSettings>) => void;

  // 备份
  exportBackupJson: () => string;
  importBackupJson: (json: string) => { ok: boolean; error?: string; books?: number };
}

function patchBook(books: Wordbook[], id: string, fn: (book: Wordbook) => Wordbook): Wordbook[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: Date.now() } : b));
}

/** 依据调度状态推导词条学习状态（新 / 在学 / 已掌握） */
function deriveStatusFromSrs(srs: StudySrs): EntryStatus {
  if (isNewSrs(srs)) return "new";
  if (isMastered(srs)) return "mastered";
  return "learning";
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
    (set, get) => ({
      hydrated: false,
      books: [],
      settings: DEFAULT_SETTINGS,
      lookupSources: DEFAULT_LOOKUP_SOURCES,
      dictionaries: [],

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

      deleteBook: (id) =>
        set((s) => ({
          books: s.books.filter((b) => b.id !== id),
          settings: { ...s.settings, lastBookId: s.settings.lastBookId === id ? null : s.settings.lastBookId },
        })),

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

      removeEntries: (bookId, ids) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({ ...b, entries: b.entries.filter((e) => !ids.includes(e.id)) })),
        })),

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
            entries: b.entries.map((e) => (e.id === entryId ? { ...e, starred: !e.starred } : e)),
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

      restoreEntries: (bookId, items) =>
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
        })),

      setStudyConfig: (bookId, patch) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            study: {
              config: { ...studyConfigOf(b), ...patch },
              daily: b.study?.daily ?? {},
            },
          })),
        })),

      applyReview: (bookId, entryId, rating, elapsedMs, nowMs) => {
        const book = get().books.find((b) => b.id === bookId);
        const entry = book?.entries.find((e) => e.id === entryId);
        if (!book || !entry) return null;
        const cfg = studyConfigOf(book);
        const now = nowMs ?? Date.now();
        const before = entry.srs;
        const next = applyGrade(before, rating, cfg.retention, now);
        const wasNew = isNewSrs(before);
        set((s) => ({
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
        }));
        return { before, next };
      },

      undoReview: (bookId, entryId, before, rating, elapsedMs) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => {
            const daily = { ...(b.study?.daily ?? {}) };
            const key = ymd(Date.now());
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
                const next = { ...e };
                delete next.srs;
                return { ...next, status: "new" as const };
              }),
              study: { config: b.study?.config ?? studyConfigOf(b), daily },
            };
          }),
        })),

      resetEntrySrs: (bookId, entryId) =>
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
        })),

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

      addLookupSource: (source) =>
        set((s) => ({ lookupSources: [...s.lookupSources, { ...source, id: uid() }] })),

      updateLookupSource: (id, patch) =>
        set((s) => ({
          lookupSources: s.lookupSources.map((src) =>
            src.id === id
              ? { ...src, ...patch, config: { ...src.config, ...(patch.config ?? {}) } }
              : src,
          ),
        })),

      removeLookupSource: (id) => set((s) => ({ lookupSources: s.lookupSources.filter((src) => src.id !== id) })),

      ensureLookupSources: () =>
        set((s) => {
          const existing = new Set(s.lookupSources.map((src) => src.id));
          const missing = DEFAULT_LOOKUP_SOURCES.filter((src) => !existing.has(src.id));
          if (!missing.length) return s;
          return { lookupSources: [...s.lookupSources, ...missing.map((src) => ({ ...src, config: { ...src.config } }))] };
        }),

      addDictionary: (meta) => set((s) => ({ dictionaries: [meta, ...s.dictionaries.filter((d) => d.id !== meta.id)] })),

      removeDictionary: (id) => set((s) => ({ dictionaries: s.dictionaries.filter((d) => d.id !== id) })),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      exportBackupJson: () => {
        const { books, settings, lookupSources, dictionaries } = get();
        return JSON.stringify(
          {
            format: "wulonvocab-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            books,
            settings,
            lookupSources,
            dictionaries,
          },
          null,
          2,
        );
      },

      importBackupJson: (json) => {
        try {
          const data = JSON.parse(json) as Record<string, unknown>;
          if (data.format !== "wulonvocab-backup" || !Array.isArray(data.books)) {
            return { ok: false, error: "不是有效的 WulonVocab 备份文件" };
          }
          const books = data.books as Wordbook[];
          set({
            books,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(typeof data.settings === "object" && data.settings ? (data.settings as Partial<AppSettings>) : {}),
            },
            lookupSources:
              Array.isArray(data.lookupSources) && data.lookupSources.length
                ? (data.lookupSources as LookupSourceConfig[])
                : DEFAULT_LOOKUP_SOURCES,
            dictionaries: Array.isArray(data.dictionaries) ? (data.dictionaries as LocalDictMeta[]) : [],
          });
          return { ok: true, books: books.length };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
    }),
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
