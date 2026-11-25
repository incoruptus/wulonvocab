import type { Entry, EntrySuspension } from "../types";

export const DAY_MS = 86_400_000;
export const DEFAULT_LEECH_THRESHOLD = 8;

export type LeechLevel = "none" | "warning" | "leech" | "suspended";

export interface LeechInfo {
  level: LeechLevel;
  lapses: number;
  threshold: number;
  halfThreshold: number;
  until?: number;
}

/** 阈值允许按词库调整；异常旧数据回到默认值。 */
export function clampLeechThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LEECH_THRESHOLD;
  return Math.min(20, Math.max(2, Math.round(value)));
}

export function halfLeechThreshold(threshold: unknown): number {
  return Math.ceil(clampLeechThreshold(threshold) / 2);
}

/** until 等于当前时刻时已经恢复，避免多一秒或少一秒的边界歧义。 */
export function isEntrySuspended(entry: Pick<Entry, "suspension">, now = Date.now()): boolean {
  return Boolean(entry.suspension && Number.isFinite(entry.suspension.until) && entry.suspension.until > now);
}

export function leechInfoOf(
  entry: Pick<Entry, "suspension" | "srs">,
  now = Date.now(),
  threshold: unknown = DEFAULT_LEECH_THRESHOLD,
): LeechInfo {
  const safeThreshold = clampLeechThreshold(threshold);
  const lapses = Math.max(0, Math.floor(entry.srs?.lapses ?? 0));
  const suspended = isEntrySuspended(entry, now);
  const level: LeechLevel = suspended
    ? "suspended"
    : lapses >= safeThreshold
      ? "leech"
      : lapses >= Math.ceil(safeThreshold / 2)
        ? "warning"
        : "none";
  return {
    level,
    lapses,
    threshold: safeThreshold,
    halfThreshold: Math.ceil(safeThreshold / 2),
    ...(entry.suspension ? { until: entry.suspension.until } : {}),
  };
}

export function suspensionForDays(days: 7 | 30, now = Date.now()): EntrySuspension {
  return { at: now, until: now + days * DAY_MS };
}

/** 导入与备份只接受完整、有限且时间顺序正确的搁置记录。 */
export function sanitizeSuspension(raw: unknown): EntrySuspension | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return undefined;
  if (typeof value.until !== "number" || !Number.isFinite(value.until) || value.until <= value.at) return undefined;
  return { at: value.at, until: value.until };
}
