import type { Entry, Wordbook } from "../types";
import { isDue, isNewSrs, retrievabilityOf } from "./engine";
import { isEntrySuspended } from "./leech";
import { DEFAULT_STUDY_CONFIG, emptyDailyLog, ymd, type StudyConfig } from "./types";

export const REVIEW_MINUTES = 1.25;
export const NEW_WORD_MINUTES = 2;

export interface StudyPlan {
  /** 今日实际安排的复习与新词数量，永不超过用户上限 */
  reviews: number;
  newWords: number;
  /** 时间预算内暂时放不下的到期词，不会被删除或改期 */
  backlog: number;
  estimatedMinutes: number;
  dailyMinutes: number;
  daysToExam?: number;
  reason: "budget" | "exam" | "backlog" | "normal";
  explanation: string;
}

function configOf(book: Wordbook): StudyConfig {
  return { ...DEFAULT_STUDY_CONFIG, ...(book.study?.config ?? {}) };
}

function localDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 考试日期按本地日历计算，避免 UTC 解析造成的一天偏差。 */
export function daysUntilExam(date: string | undefined, now: number): number | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  if (!Number.isFinite(target.getTime()) || target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return undefined;
  return Math.ceil((target.getTime() - localDayStart(now)) / 86400000);
}

/**
 * 规则档每日计划。只做预算内的减法，不提高上限、不改保持率、不改 due。
 * 复习优先；时间不够时先减少新词，再限制本轮复习量，积压留到后续每日限额自然消化。
 */
export function computeStudyPlan(book: Wordbook, now = Date.now()): StudyPlan {
  const cfg = configOf(book);
  const dailyMinutes = Number.isFinite(cfg.dailyMinutes)
    ? Math.min(180, Math.max(5, Math.round(cfg.dailyMinutes)))
    : DEFAULT_STUDY_CONFIG.dailyMinutes;
  const daily = book.study?.daily[ymd(now)] ?? emptyDailyLog();
  const eligible = book.entries.filter((entry) => !isEntrySuspended(entry, now));
  const due = eligible.filter((entry) => isDue(entry.srs, now)).length;
  const newRemaining = Math.max(0, cfg.newPerDay - daily.added);
  const newAvailable = eligible.filter((entry) => isNewSrs(entry.srs)).length;
  const reviewRemaining = Math.max(0, cfg.reviewPerDay - daily.reviewed);
  const daysToExam = daysUntilExam(cfg.examDate, now);

  let reviews = Math.min(due, reviewRemaining);
  let newWords = Math.min(newRemaining, newAvailable);
  let reason: StudyPlan["reason"] = "normal";
  let explanation = "先安排到期复习，再学习新词；预计时间会随卡片内容与个人节奏变化。";

  if (cfg.adaptivePlan !== false) {
    const reviewBudget = Math.min(reviews, Math.max(0, Math.floor((dailyMinutes * 0.8) / REVIEW_MINUTES)));
    const minutesAfterReviews = Math.max(0, dailyMinutes - reviewBudget * REVIEW_MINUTES);
    let affordableNew = Math.min(newWords, Math.max(0, Math.floor(minutesAfterReviews / NEW_WORD_MINUTES)));
    if (reviewBudget < reviews) affordableNew = 0;
    if (daysToExam !== undefined && daysToExam >= 0 && daysToExam <= 14) {
      reason = "exam";
      affordableNew = Math.min(affordableNew, Math.max(0, Math.floor(cfg.newPerDay * 0.5)));
    }
    if (reason === "exam" || reviewBudget < reviews || affordableNew < newWords) {
      if (reason !== "exam") reason = "backlog";
      reviews = reviewBudget;
      newWords = affordableNew;
      explanation = reason === "exam"
        ? `距离目标日期还有 ${daysToExam} 天，本轮少学新词，把时间留给到期复习。`
        : "当前复习负载较高，先减少新词；放不下的词保留在原计划里，不会改期或丢失。";
    }
  }

  const backlog = Math.max(0, due - reviews);
  return {
    reviews,
    newWords,
    backlog,
    estimatedMinutes: Math.ceil(reviews * REVIEW_MINUTES + newWords * NEW_WORD_MINUTES),
    dailyMinutes,
    daysToExam,
    reason,
    explanation,
  };
}

export interface WeaknessEvidence {
  score: number;
  recentAgain: boolean;
  retrievability: number;
}

/** 弱词分数只用于选任务，不直接改变正确答案的等级或 FSRS 参数。 */
export function weaknessOf(
  entry: Pick<Entry, "srs">,
  now: number,
  retention: number,
  evidence: { recentAgain?: boolean; slowSuccess?: boolean; lastRating?: number } = {},
): WeaknessEvidence {
  const srs = entry.srs;
  const retrievability = retrievabilityOf(srs, now, retention);
  const lapses = Math.max(0, srs?.lapses ?? 0);
  const stability = Math.max(0, srs?.stability ?? 0);
  const score = Math.min(100, Math.round(
    lapses * 9 +
    (1 - retrievability) * 35 +
    Math.max(0, 1 - stability / 30) * 20 +
    (evidence.recentAgain ? 25 : 0) +
    (evidence.slowSuccess ? 5 : 0),
  ));
  return { score, recentAgain: Boolean(evidence.recentAgain), retrievability };
}

/**
 * 弱词优先只重排候选，不增删队列。最多把 capPct 的候选放到前面，
 * 其余仍保持原有到期 / 可检索度顺序；相似词避让在随后统一执行。
 */
export function prioritizeWeakReviews<T extends { entryId: string }>(
  ordered: T[],
  entries: Entry[],
  evidence: ReadonlyMap<string, { recentAgain?: boolean; slowSuccess?: boolean; lastRating?: number }>,
  now: number,
  retention: number,
  capPct = 20,
): T[] {
  if (ordered.length < 2) return [...ordered];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const cap = Math.min(ordered.length, Math.max(1, Math.floor((ordered.length * Math.min(100, Math.max(0, capPct))) / 100)));
  const ranked = ordered
    .map((item, index) => {
      const entry = byId.get(item.entryId);
      if (!entry) return { item, index, score: -1 };
      return { item, index, ...weaknessOf(entry, now, retention, evidence.get(entry.id)) };
    })
    .filter((candidate) => candidate.score >= 30)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const weakIds = new Set(ranked.slice(0, cap).map((candidate) => candidate.item.entryId));
  return [...ordered.filter((item) => weakIds.has(item.entryId)), ...ordered.filter((item) => !weakIds.has(item.entryId))];
}
