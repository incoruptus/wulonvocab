import { createStore, del, get, set } from "idb-keyval";
import type { GroupDim, TagMembership } from "./study/group";
import { GROUP_DIM_OPTIONS } from "./study/group";
import { SORT_DIM_OPTIONS, type SortDim } from "./study/sort";

export type SortDir = "asc" | "desc";
export type StatusFilter = "all" | "new" | "learning" | "mastered";
export type LeechFilter = "all" | "warning" | "leech" | "suspended";

export interface ViewPrefs {
  sort: SortDim;
  dir: SortDir;
  shuffleSeed?: number;
  group: GroupDim;
  tagMode: TagMembership;
  contextKey: string;
  status: StatusFilter;
  leechFilter: LeechFilter;
  starOnly: boolean;
  tag: string;
  collapsed: string[];
  showEmptyGroups: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  prefs: ViewPrefs;
  /** 跨端合并时间戳；旧数据缺省为 0 */
  updatedAt: number;
}

export interface BookViewState {
  prefs: ViewPrefs;
  savedViews: SavedView[];
}

/** 设备本地视图偏好：不进主 store、不进历史、不进同步与备份。 */
const viewStore = createStore("wulonvocab-view-prefs", "kv");

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  sort: "list",
  dir: "asc",
  group: "none",
  tagMode: "first",
  contextKey: "",
  status: "all",
  leechFilter: "all",
  starOnly: false,
  tag: "",
  collapsed: [],
  showEmptyGroups: false,
};

const SORT_VALUES = new Set<string>(SORT_DIM_OPTIONS.map((item) => item.value));
const GROUP_VALUES = new Set<string>(GROUP_DIM_OPTIONS.map((item) => item.value));

function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

export function normalizeViewPrefs(raw: unknown): ViewPrefs {
  const value = raw && typeof raw === "object" ? (raw as Partial<ViewPrefs>) : {};
  return {
    sort: oneOf(value.sort, SORT_VALUES, "list"),
    dir: value.dir === "desc" ? "desc" : "asc",
    shuffleSeed:
      typeof value.shuffleSeed === "number" && Number.isFinite(value.shuffleSeed)
        ? value.shuffleSeed >>> 0
        : value.sort === "shuffle"
          ? 0
          : undefined,
    group: oneOf(value.group, GROUP_VALUES, "none"),
    tagMode: value.tagMode === "all" ? "all" : "first",
    contextKey: typeof value.contextKey === "string" ? value.contextKey : "",
    status: oneOf(value.status, new Set(["all", "new", "learning", "mastered"]), "all"),
    leechFilter: oneOf(value.leechFilter, new Set(["all", "warning", "leech", "suspended"]), "all"),
    starOnly: Boolean(value.starOnly),
    tag: typeof value.tag === "string" ? value.tag : "",
    collapsed: Array.isArray(value.collapsed) ? value.collapsed.filter((item): item is string => typeof item === "string").slice(0, 500) : [],
    showEmptyGroups: Boolean(value.showEmptyGroups),
  };
}

export function normalizeBookViewState(raw: unknown): BookViewState {
  const value = raw && typeof raw === "object" ? (raw as Partial<BookViewState>) : {};
  const rawViews: unknown[] = Array.isArray(value.savedViews) ? value.savedViews : [];
  const savedViews = rawViews
    .filter((item): item is SavedView => Boolean(item && typeof item === "object" && typeof (item as SavedView).id === "string" && typeof (item as SavedView).name === "string"))
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      name: item.name.slice(0, 40),
      prefs: normalizeViewPrefs(item.prefs),
      updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
    }));
  return { prefs: normalizeViewPrefs(value.prefs), savedViews };
}

/** 按稳定 ID 与更新时间合并命名视图；最多保留最新 20 个。 */
export function mergeSavedViews(a: SavedView[], b: SavedView[]): SavedView[] {
  const byId = new Map<string, SavedView>();
  for (const view of [...a, ...b]) {
    const prev = byId.get(view.id);
    const tieKey = (item: SavedView) => JSON.stringify([item.name, item.prefs]);
    if (!prev || view.updatedAt > prev.updatedAt || (view.updatedAt === prev.updatedAt && tieKey(view) >= tieKey(prev))) {
      byId.set(view.id, view);
    }
  }
  return [...byId.values()]
    .sort((x, y) => x.updatedAt - y.updatedAt || x.id.localeCompare(y.id))
    .slice(-20);
}

export async function loadBookViewState(bookId: string): Promise<BookViewState> {
  try {
    return normalizeBookViewState(await get(bookId, viewStore));
  } catch {
    return { prefs: { ...DEFAULT_VIEW_PREFS }, savedViews: [] };
  }
}

/** 只持久化设备本地临时偏好；保存视图已迁入主 store，不再写入这份旧缓存。 */
export async function saveBookViewState(bookId: string, state: BookViewState): Promise<void> {
  await set(bookId, { prefs: normalizeViewPrefs(state.prefs), savedViews: [] }, viewStore);
}

export async function clearBookViewState(bookId: string): Promise<void> {
  await del(bookId, viewStore);
}
