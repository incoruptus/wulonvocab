import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import { clamp } from "../utils";
import type { StudySrs } from "./types";

/**
 * SRS 调度引擎（纯函数封装 ts-fsrs）
 * ------------------------------------------------------------------
 * - 卡片状态在边界处与 ts-fsrs 的 Card 转换；
 * - retention（desired retention）来自每本书的学习配置；
 * - 所有函数对相同输入产生相同输出（时间由调用方注入），便于单测。
 */

export const RATING_AGAIN = Rating.Again as 1;
export const RATING_HARD = Rating.Hard as 2;
export const RATING_GOOD = Rating.Good as 3;
export const RATING_EASY = Rating.Easy as 4;

export type GradeValue = 1 | 2 | 3 | 4;

export const GRADE_META: Record<GradeValue, { label: string; hint: string; key: string }> = {
  1: { label: "忘记", hint: "完全想不起来", key: "1" },
  2: { label: "模糊", hint: "想起来了，很吃力", key: "2" },
  3: { label: "记得", hint: "正常回忆", key: "3" },
  4: { label: "轻松", hint: "毫不费力", key: "4" },
};

function paramsFor(retention: number) {
  // enable_fuzz 与 Anki 一致（±5% 抖动，避免长期同步化）；
  // 注意：预览与评分必须共享同一 now，否则抖动种子不同导致显示与落库不一致。
  return generatorParameters({
    request_retention: clamp(retention, 0.7, 0.98),
    enable_fuzz: true,
  });
}

/** 防御时钟回拨：ts-fsrs 对负 delta_t 会抛错 */
export function clampReviewNow(srs: StudySrs | undefined, now: number): number {
  const last = srs?.lastReview ?? 0;
  return last > 0 && now <= last ? last + 1000 : now;
}

export function toCard(srs: StudySrs): Card {
  return {
    due: new Date(srs.due),
    last_review: srs.lastReview ? new Date(srs.lastReview) : undefined,
    stability: srs.stability,
    difficulty: srs.difficulty,
    elapsed_days: srs.elapsedDays,
    scheduled_days: srs.scheduledDays,
    reps: srs.reps,
    lapses: srs.lapses,
    state: srs.state as State,
    learning_steps: srs.learningSteps,
  } as Card;
}

export function fromCard(card: Card): StudySrs {
  return {
    due: card.due.getTime(),
    lastReview: card.last_review ? card.last_review.getTime() : undefined,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learningSteps: card.learning_steps,
  };
}

export function newSrs(now = Date.now()): StudySrs {
  return fromCard(createEmptyCard(new Date(now)));
}

export function isNewSrs(srs?: StudySrs): boolean {
  return !srs || srs.state === State.New || srs.reps === 0;
}

export function isDue(srs: StudySrs | undefined, now: number): boolean {
  return Boolean(srs) && !isNewSrs(srs) && srs!.due <= now;
}

/** 已掌握：处于复习态且间隔 ≥ 21 天 */
export function isMastered(srs?: StudySrs): boolean {
  return Boolean(srs) && srs!.state === State.Review && srs!.scheduledDays >= 21;
}

/** 会话内需要再练：处于学习/重学态且短期内到期 */
export function needsSessionRequeue(srs: StudySrs, now: number, horizonMs = 20 * 60 * 1000): boolean {
  return (srs.state === State.Learning || srs.state === State.Relearning) && srs.due - now <= horizonMs;
}

export interface GradePreview {
  rating: GradeValue;
  label: string;
  dueTs: number;
  intervalMs: number;
  text: string;
}

/** 四个评级对应的下次间隔预览 */
export function previewGrades(srs: StudySrs | undefined, retention: number, nowInput = Date.now()): GradePreview[] {
  const now = clampReviewNow(srs, nowInput);
  const card = srs ? toCard(srs) : createEmptyCard(new Date(now));
  const algorithm = fsrs(paramsFor(retention));
  const preview = algorithm.repeat(card, new Date(now));
  return ([1, 2, 3, 4] as GradeValue[]).map((rating) => {
    const item = preview[rating as Grade];
    const dueTs = item.card.due.getTime();
    const intervalMs = Math.max(0, dueTs - now);
    return {
      rating,
      label: GRADE_META[rating].label,
      dueTs,
      intervalMs,
      text: formatInterval(intervalMs),
    };
  });
}

/** 应用评级，返回新的调度状态（nowInput 应与预览使用同一时刻） */
export function applyGrade(srs: StudySrs | undefined, rating: GradeValue, retention: number, nowInput = Date.now()): StudySrs {
  const now = clampReviewNow(srs, nowInput);
  const card = srs ? toCard(srs) : createEmptyCard(new Date(now));
  const algorithm = fsrs(paramsFor(retention));
  const { card: next } = algorithm.next(card, new Date(now), rating as Grade);
  return fromCard(next);
}

/** 人类可读的间隔文本（Anki 风格） */
export function formatInterval(ms: number): string {
  if (ms <= 0) return "现在";
  const min = ms / 60000;
  if (min < 1) return "<1 分钟";
  if (min < 60) return `${Math.round(min)} 分钟`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} 小时`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} 天`;
  const months = days / 30;
  if (months < 12) return `${months < 10 ? Math.round(months * 10) / 10 : Math.round(months)} 个月`;
  const years = days / 365;
  return `${Math.round(years * 10) / 10} 年`;
}

/** 下次到期时间文本（相对某时刻） */
export function formatDue(dueTs: number | undefined, now = Date.now()): string {
  if (dueTs === undefined) return "—";
  if (dueTs <= now) return "现在";
  return formatInterval(dueTs - now);
}
