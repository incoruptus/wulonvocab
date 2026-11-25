import { clampBoundaryHour, weekKey, ymd } from "./types";

export type GoalTier = "light" | "target" | "challenge";
export const GOAL_TARGETS: Record<GoalTier, number> = { light: 20, target: 40, challenge: 60 };

export function goalTargetOf(tier: unknown): number {
  return GOAL_TARGETS[tier === "light" || tier === "challenge" ? tier : "target"];
}

export interface StreakResult {
  streak: number;
  graceUsed: boolean;
}

/**
 * 连续学习：今天未学则从昨天起算；每周自动宽恕一个单日缺口。
 * 宽恕只恢复连续，不增加学习量，也不补写热力图。
 */
export function computeStreak(
  heatmap: Record<string, number>,
  now: number,
  opts: { enabled?: boolean; boundaryHour?: number } = {},
): StreakResult {
  if (opts.enabled === false) return { streak: 0, graceUsed: false };
  const boundary = clampBoundaryHour(opts.boundaryHour);
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!(heatmap[ymd(cursor.getTime(), boundary)] > 0)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  let graceUsed = false;
  const graceWeeks = new Set<string>();
  while (true) {
    const key = ymd(cursor.getTime(), boundary);
    if (heatmap[key] > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    const missed = new Date(cursor);
    missed.setDate(missed.getDate() - 1);
    const missedKey = ymd(missed.getTime(), boundary);
    const week = weekKey(missed.getTime(), boundary);
    if (heatmap[missedKey] > 0 && !graceWeeks.has(week)) {
      graceWeeks.add(week);
      graceUsed = true;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return { streak, graceUsed };
}

export function studyWeekDays(heatmap: Record<string, number>, now: number, boundaryHour = 4): number {
  const boundary = clampBoundaryHour(boundaryHour);
  const monday = Date.parse(`${weekKey(now, boundary)}T12:00:00`);
  let days = 0;
  for (let i = 0; i < 7; i += 1) {
    if (heatmap[ymd(monday + i * 86400000, boundary)] > 0) days += 1;
  }
  return days;
}
