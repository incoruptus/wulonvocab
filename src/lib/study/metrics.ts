import type { Wordbook } from "../types";
import { studyConfigOf, studyStateOf } from "./queue";
import { clampBoundaryHour, ymd } from "./types";
import { computeStreak, goalTargetOf, studyWeekDays, type GoalTier } from "./goals";

/**
 * 学习中心聚合指标（纯函数；时间由调用方注入）
 * 目标与待办只统计 active 词库；热力图、正确率与连续天数保留全部实际学习历史。
 */

export interface HubMetrics {
  books: number;
  entries: number;
  due: number;
  overdue: number;
  learning: number;
  mastered: number;
  newRemainingTotal: number;
  newPerDayTotal: number;
  /** 未来 7 天（不含今天已逾期）每天到期数 */
  due7: number[];
  /** 全词库合计：日期 -> 复习次数 */
  heatmap: Record<string, number>;
  /** 连续学习天数（今天或昨天起算） */
  streak: number;
  /** 近 30 天正确率（0-1，无数据 null；近似值 = 1 - again/reviewed） */
  accuracy30: number | null;
  /** 学习中卡片的 stability 中位数（天） */
  medianStability: number | null;
  /** 今日有效提取目标（次） */
  goalTarget: number;
  /** 本周有有效提取的天数（备用轨道） */
  weekDays: number;
  /** 当前连续是否使用过每周自动宽恕 */
  streakGraceUsed: boolean;
  /** 今日已复习次数与已学新词 */
  reviewedToday: number;
  addedToday: number;
  lastActiveAt: number | null;
}

function startOfStudyDay(now: number, boundaryHour: number): number {
  const d = new Date(now - boundaryHour * 3600000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + boundaryHour * 3600000;
}

export function computeHubMetrics(
  books: Wordbook[],
  now: number,
  opts: { includeInactiveInGoals?: boolean; goalTier?: GoalTier; streakEnabled?: boolean; dayBoundaryHour?: number } = {},
): HubMetrics {
  const boundaryHour = clampBoundaryHour(opts.dayBoundaryHour);
  const today0 = startOfStudyDay(now, boundaryHour);
  const todayKey = ymd(now, boundaryHour);
  const goalBooks = opts.includeInactiveInGoals ? books : books.filter((book) => studyStateOf(book) === "active");
  const heatmap: Record<string, number> = {};
  let due = 0;
  let overdue = 0;
  let learning = 0;
  let mastered = 0;
  let entries = 0;
  let newRemainingTotal = 0;
  let newPerDayTotal = 0;
  const due7 = [0, 0, 0, 0, 0, 0, 0];
  const stabilities: number[] = [];
  let reviewedToday = 0;
  let addedToday = 0;
  let lastActiveAt: number | null = null;

  // 实际学习历史：暂停/归档不抹掉过去的热力图与今日计数。
  for (const book of books) {
    const todayLog = book.study?.daily?.[todayKey];
    addedToday += todayLog?.added ?? 0;
    reviewedToday += todayLog?.reviewed ?? 0;
    for (const [key, log] of Object.entries(book.study?.daily ?? {})) {
      heatmap[key] = (heatmap[key] ?? 0) + log.reviewed;
    }
  }

  // 目标与负载：只统计 active 词库。
  for (const book of goalBooks) {
    const cfg = studyConfigOf(book);
    const todayLog = book.study?.daily?.[todayKey];
    newPerDayTotal += cfg.newPerDay;

    for (const e of book.entries) {
      entries += 1;
      const srs = e.srs;
      if (!srs || srs.state === 0 || srs.reps === 0) continue; // 新词
      if (srs.state === 2 && srs.scheduledDays >= 21) mastered += 1;
      else learning += 1;
      if (srs.stability > 0) stabilities.push(srs.stability);
      if (srs.due <= now) {
        due += 1;
        if (srs.due < today0) overdue += 1;
      } else {
        const d = Math.floor((srs.due - today0) / 86400000);
        if (d >= 0 && d < 7) due7[d] += 1;
      }
    }

    const remaining = Math.max(0, cfg.newPerDay - (todayLog?.added ?? 0));
    const hasNew = book.entries.some((e) => !e.srs || e.srs.state === 0 || e.srs.reps === 0);
    if (hasNew) newRemainingTotal += remaining;
  }

  // 连续天数：每周自动宽恕一个单日缺口；关闭时完全不显示。
  const streakResult = computeStreak(heatmap, now, { enabled: opts.streakEnabled, boundaryHour });
  const streak = streakResult.streak;
  const weekDays = studyWeekDays(heatmap, now, boundaryHour);

  // 近 30 天正确率（近似：1 - again/reviewed），保留全部实际历史。
  let again = 0;
  let reviewed30 = 0;
  const cutoff = now - 30 * 86400000;
  for (const book of books) {
    for (const [key, log] of Object.entries(book.study?.daily ?? {})) {
      const ts = Date.parse(`${key}T12:00:00`);
      if (Number.isFinite(ts) && ts >= cutoff) {
        again += log.again;
        reviewed30 += log.reviewed;
      }
    }
  }
  const accuracy30 = reviewed30 > 0 ? 1 - again / reviewed30 : null;

  stabilities.sort((a, b) => a - b);
  const medianStability = stabilities.length ? stabilities[Math.floor(stabilities.length / 2)] : null;

  const days = Object.entries(heatmap).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i][1] > 0) {
      const ts = Date.parse(`${days[i][0]}T12:00:00`);
      if (Number.isFinite(ts)) lastActiveAt = ts;
      break;
    }
  }

  return {
    books: books.length,
    entries,
    due,
    overdue,
    learning,
    mastered,
    newRemainingTotal,
    newPerDayTotal,
    due7,
    heatmap,
    streak,
    goalTarget: goalTargetOf(opts.goalTier),
    weekDays,
    streakGraceUsed: streakResult.graceUsed,
    accuracy30,
    medianStability,
    reviewedToday,
    addedToday,
    lastActiveAt,
  };
}
