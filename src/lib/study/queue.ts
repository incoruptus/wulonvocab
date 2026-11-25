import type { BookStudyState, Entry, Wordbook } from "../types";
import { isDue, isMastered, isNewSrs, retrievabilityOf } from "./engine";
import { bigramJaccard, editDistance, firstTranslation } from "./quiz";
import { sortEntries, type SortDim } from "./sort";
import { isEntrySuspended, clampLeechThreshold } from "./leech";
import { DEFAULT_STUDY_CONFIG, emptyDailyLog, ymd, type BookStudy, type NewWordOrder, type StudyConfig, type StudyDailyLog } from "./types";
import { computeStudyPlan, prioritizeWeakReviews } from "./planning";
/** 取（或补默认）学习配置视图，不写库 */
export function studyOf(book: Wordbook): BookStudy {
  return book.study ?? { config: { ...DEFAULT_STUDY_CONFIG }, daily: {} };
}

export function studyConfigOf(book: Wordbook): StudyConfig {
  const cfg = { ...DEFAULT_STUDY_CONFIG, ...(book.study?.config ?? {}) };
  return {
    ...cfg,
    leechThreshold: clampLeechThreshold(cfg.leechThreshold),
    newPerDay: Number.isFinite(cfg.newPerDay) ? Math.max(0, Math.round(cfg.newPerDay)) : DEFAULT_STUDY_CONFIG.newPerDay,
    reviewPerDay: Number.isFinite(cfg.reviewPerDay) ? Math.max(0, Math.round(cfg.reviewPerDay)) : DEFAULT_STUDY_CONFIG.reviewPerDay,
    dailyMinutes: Number.isFinite(cfg.dailyMinutes) ? Math.min(180, Math.max(5, Math.round(cfg.dailyMinutes))) : DEFAULT_STUDY_CONFIG.dailyMinutes,
    weakCapPct: 20,
    choiceTypes: cfg.choiceTypes.filter((kind) => kind === "word2zh" || kind === "zh2word" || kind === "def2word"),
  };
}

export function dailyLogOf(book: Wordbook, now = Date.now(), boundaryHour = 4): StudyDailyLog {
  return book.study?.daily[ymd(now, boundaryHour)] ?? emptyDailyLog();
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
    if (isEntrySuspended(e, now)) continue;
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

export function studyStateOf(book: Wordbook): BookStudyState {
  return book.studyState ?? "active";
}

export function newOrderSort(order: NewWordOrder): { dim: SortDim; dir: "asc" | "desc" } {
  switch (order) {
    case "listDesc":
      return { dim: "list", dir: "desc" };
    case "az":
      return { dim: "az", dir: "asc" };
    case "azDesc":
      return { dim: "az", dir: "desc" };
    case "shuffle":
      return { dim: "shuffle", dir: "asc" };
    default:
      return { dim: "list", dir: "asc" };
  }
}

export interface QueueItem {
  entryId: string;
  isNew: boolean;
  /** 本次队列仍按初学三步流程处理；首次评分后保留，回炉与撤销不丢失 */
  newWord?: boolean;
}

export function buildQueue(
  book: Wordbook,
  mode: StudyMode,
  now = Date.now(),
  opts: {
    allowSimilar?: boolean;
    order?: StudyConfig["queueOrder"];
    rng?: () => number;
    weakEvidence?: ReadonlyMap<string, { recentAgain?: boolean; slowSuccess?: boolean; lastRating?: number }>;
  } = {},
): QueueItem[] {
  if (studyStateOf(book) !== "active") return [];
  const cfg = studyConfigOf(book);
  const plan = computeStudyPlan(book, now);
  const daily = dailyLogOf(book, now);
  const items: QueueItem[] = [];

  if (mode !== "new") {
    const reviewRemaining = Math.min(Math.max(0, cfg.reviewPerDay - daily.reviewed), plan.reviews);
    const dueCandidates = book.entries.filter((e) => !isEntrySuspended(e, now) && isDue(e.srs, now));
    const retrievability = cfg.reviewOrder === "retrievability"
      ? new Map(dueCandidates.map((entry) => [entry.id, retrievabilityOf(entry.srs, now, cfg.retention)]))
      : null;
    const dueEntries = dueCandidates
      .sort((a, b) => {
        if (retrievability) {
          const byR = (retrievability.get(a.id) ?? 1) - (retrievability.get(b.id) ?? 1);
          if (byR !== 0) return byR;
        }
        return (a.srs!.due ?? 0) - (b.srs!.due ?? 0);
      })
      .slice(0, reviewRemaining);
    const reviewItems = dueEntries.map((entry) => ({ entryId: entry.id, isNew: false }));
    items.push(...(cfg.weakPriority
      ? prioritizeWeakReviews(reviewItems, book.entries, opts.weakEvidence ?? new Map(), now, cfg.retention, cfg.weakCapPct)
      : reviewItems));
  }
  if (mode !== "review") {
    const remaining = Math.min(Math.max(0, cfg.newPerDay - daily.added), plan.newWords);
    const { dim, dir } = newOrderSort(cfg.newOrder);
    const newEntries = sortEntries(book.entries.filter((e) => !isEntrySuspended(e, now) && isNewSrs(e.srs)), dim, dir, { now, rng: opts.rng }).slice(0, remaining);
    for (const e of newEntries) items.push({ entryId: e.id, isNew: true, newWord: true });
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
