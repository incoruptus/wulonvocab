import type { Entry, Wordbook } from "../types";
import { isDue, isMastered, isNewSrs } from "./engine";
import { bigramJaccard, editDistance, firstTranslation } from "./quiz";
import { DEFAULT_STUDY_CONFIG, emptyDailyLog, ymd, type BookStudy, type StudyConfig, type StudyDailyLog } from "./types";
/** 取（或补默认）学习配置视图，不写库 */
export function studyOf(book: Wordbook): BookStudy {
  return book.study ?? { config: { ...DEFAULT_STUDY_CONFIG }, daily: {} };
}

export function studyConfigOf(book: Wordbook): StudyConfig {
  return { ...DEFAULT_STUDY_CONFIG, ...(book.study?.config ?? {}) };
}

export function dailyLogOf(book: Wordbook, now = Date.now()): StudyDailyLog {
  return book.study?.daily[ymd(now)] ?? emptyDailyLog();
}

export interface StudyOverview {
  /** 今日待复习（非新卡且已到期） */
  due: number;
  /** 今日剩余可学新词 */
  newRemaining: number;
  /** 已引入（在学 + 复习中） */
  learning: number;
  /** 已掌握 */
  mastered: number;
  /** 最早到期时间（用于「下次复习」提示） */
  nextDue?: number;
}

export function studyOverview(book: Wordbook, now = Date.now()): StudyOverview {
  const cfg = studyConfigOf(book);
  const daily = dailyLogOf(book, now);
  let due = 0;
  let learning = 0;
  let mastered = 0;
  let nextDue: number | undefined;
  for (const e of book.entries) {
    if (isNewSrs(e.srs)) continue;
    if (isMastered(e.srs)) mastered += 1;
    else learning += 1;
    if (isDue(e.srs, now)) due += 1;
    else if (e.srs && (nextDue === undefined || e.srs.due < nextDue)) nextDue = e.srs.due;
  }
  return {
    due,
    newRemaining: Math.max(0, cfg.newPerDay - daily.added),
    learning,
    mastered,
    nextDue,
  };
}

export type StudyMode = "mixed" | "review" | "new";

export interface QueueItem {
  entryId: string;
  isNew: boolean;
}

export function buildQueue(
  book: Wordbook,
  mode: StudyMode,
  now = Date.now(),
  opts: { allowSimilar?: boolean; order?: StudyConfig["queueOrder"]; rng?: () => number } = {},
): QueueItem[] {
  const cfg = studyConfigOf(book);
  const daily = dailyLogOf(book, now);
  const items: QueueItem[] = [];

  if (mode !== "new") {
    const reviewRemaining = Math.max(0, cfg.reviewPerDay - daily.reviewed);
    const dueEntries = book.entries
      .filter((e) => isDue(e.srs, now))
      .sort((a, b) => (a.srs!.due ?? 0) - (b.srs!.due ?? 0))
      .slice(0, reviewRemaining);
    for (const e of dueEntries) items.push({ entryId: e.id, isNew: false });
  }
  if (mode !== "review") {
    const remaining = Math.max(0, cfg.newPerDay - daily.added);
    const newEntries = book.entries.filter((e) => isNewSrs(e.srs)).slice(0, remaining);
    for (const e of newEntries) items.push({ entryId: e.id, isNew: true });
  }
  const order = opts.order ?? cfg.queueOrder;
  if (order === "shuffle") return avoidSimilarIfNeeded(book.entries, shuffleItems(items, opts.rng), cfg, opts);
  return avoidSimilarIfNeeded(book.entries, items, cfg, opts);
}

function avoidSimilarIfNeeded(
  entries: Entry[],
  items: QueueItem[],
  cfg: StudyConfig,
  opts: { allowSimilar?: boolean },
): QueueItem[] {
  if (!cfg.similarityAvoid || opts.allowSimilar) return items;
  return avoidSimilarNeighbors(entries, items);
}

/** Fisher–Yates；rng 注入以便单测确定性（默认 Math.random，每次会话开始打散一次） */
export function shuffleItems(items: QueueItem[], rng: () => number = Math.random): QueueItem[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------------- 相似词避让（T3 · 依据 docs/research/learning-science-2026-10.md） ---------------- */

const SIMILAR_GAP = 4; // 相似词至少隔 3 张卡（索引差 ≥4）

/** 两词视为「易混」：词形相近（编辑距离 ≤2，长词）或首义项语义高重叠（bigram Jaccard ≥0.6） */
export function wordsSimilar(a: Entry, b: Entry): boolean {
  const ha = a.headword.trim().toLowerCase();
  const hb = b.headword.trim().toLowerCase();
  if (ha.length >= 4 && hb.length >= 4 && Math.abs(ha.length - hb.length) <= 2 && editDistance(ha, hb, 2) <= 2) {
    return true;
  }
  const ta = firstTranslation(a)?.text;
  const tb = firstTranslation(b)?.text;
  if (ta && tb && bigramJaccard(ta, tb) >= 0.6) return true;
  return false;
}

/**
 * 贪心避让：把相似词拉开到至少 SIMILAR_GAP 的间隔；做不到时保持原序（软约束，绝不丢/阻塞）。
 * 纯函数，不改原数组。
 */
export function avoidSimilarNeighbors(entries: Entry[], items: QueueItem[], gap = SIMILAR_GAP): QueueItem[] {
  if (items.length <= 3) return [...items];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rest = [...items];
  const out: QueueItem[] = [];
  const conflicts = (item: QueueItem): boolean => {
    const e = byId.get(item.entryId);
    if (!e) return false;
    const window = out.slice(-(gap - 1));
    return window.some((prev) => {
      const pe = byId.get(prev.entryId);
      return pe ? wordsSimilar(pe, e) : false;
    });
  };
  while (rest.length) {
    let pickIdx = 0;
    if (conflicts(rest[0])) {
      const alt = rest.findIndex((it, idx) => idx > 0 && !conflicts(it));
      if (alt > 0) pickIdx = alt;
    }
    out.push(rest.splice(pickIdx, 1)[0]);
  }
  return out;
}

/** 学习步回炉的插入位置：从最小间隔后找第一个与邻居都不相似的位置；不满足则退回默认位 */
export function requeueInsertIndex(entries: Entry[], rest: QueueItem[], entryId: string, gap = SIMILAR_GAP): number {
  const fallback = Math.min(rest.length, SIMILAR_GAP);
  const e = entries.find((x) => x.id === entryId);
  if (!e) return fallback;
  const lo = Math.max(0, Math.min(2, rest.length)); // 至少隔 2 张再回炉（保留既有节奏）
  for (let i = lo; i <= rest.length; i += 1) {
    const before = rest.slice(Math.max(0, i - (gap - 1)), i).map((x) => entries.find((en) => en.id === x.entryId));
    const after = rest.slice(i, i + (gap - 1)).map((x) => entries.find((en) => en.id === x.entryId));
    const clash = [...before, ...after].some((n) => n && wordsSimilar(n, e));
    if (!clash) return i;
  }
  return fallback;
}

export function entryById(book: Wordbook, id: string): Entry | undefined {
  return book.entries.find((e) => e.id === id);
}
