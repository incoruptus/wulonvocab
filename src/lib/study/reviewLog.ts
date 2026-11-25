import { createStore, del, get, keys, set } from "idb-keyval";
import type { StudySrs, QuizKind } from "./types";
import type { GradeValue } from "./engine";

export type ReviewSessionMode = "mixed" | "review" | "new" | "cram";
export type ReviewInteraction = "flip" | "choice" | "cloze" | "new-recognition" | "new-recall" | "spell";

export interface ReviewLogContext {
  sessionId: string;
  mode: ReviewSessionMode;
  interaction: ReviewInteraction;
  questionKind?: QuizKind;
  firstAttempt?: boolean;
  newCard?: boolean;
  /** 自由练习：只写本机日志，不改变 SRS、每日统计或同步状态 */
  practiceOnly?: boolean;
}

/** 一次有效评分或撤销补偿。设备本地，不进主 store、history、sync 与备份。 */
export interface ReviewLogEvent {
  id: string;
  kind: "review" | "undo";
  at: number;
  bookId: string;
  entryId?: string;
  sessionId?: string;
  mode?: ReviewSessionMode;
  interaction?: ReviewInteraction;
  questionKind?: QuizKind;
  rating?: GradeValue;
  elapsedMs?: number;
  dayKey?: string;
  firstAttempt?: boolean;
  newCard?: boolean;
  /** 自由练习事件不改变 SRS 与每日统计 */
  practiceOnly?: boolean;
  before?: StudySrs;
  next?: StudySrs;
  originalEventId?: string;
}

export type ReviewLogInput = Omit<ReviewLogEvent, "id" | "kind"> & { id: string; kind?: "review" };

const reviewStore = createStore("wulonvocab-review-log-v1", "kv");
const PREFIX = "review:";

function isSrs(value: unknown): value is StudySrs {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<StudySrs>;
  return typeof s.due === "number" && typeof s.stability === "number" && typeof s.state === "number";
}

export function normalizeReviewEvent(raw: unknown): ReviewLogEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<ReviewLogEvent>;
  if (typeof e.id !== "string" || typeof e.at !== "number" || !Number.isFinite(e.at) || typeof e.bookId !== "string") return null;
  const kind = e.kind === "undo" ? "undo" : "review";
  const rating = e.rating === 1 || e.rating === 2 || e.rating === 3 || e.rating === 4 ? e.rating : undefined;
  return {
    id: e.id,
    kind,
    at: e.at,
    bookId: e.bookId,
    entryId: typeof e.entryId === "string" ? e.entryId : undefined,
    sessionId: typeof e.sessionId === "string" ? e.sessionId : undefined,
    mode: e.mode === "mixed" || e.mode === "review" || e.mode === "new" || e.mode === "cram" ? e.mode : undefined,
    interaction:
      e.interaction === "flip" || e.interaction === "choice" || e.interaction === "cloze" || e.interaction === "new-recognition" || e.interaction === "new-recall" || e.interaction === "spell"
        ? e.interaction
        : undefined,
    questionKind: e.questionKind === "word2zh" || e.questionKind === "zh2word" || e.questionKind === "def2word" || e.questionKind === "cloze" || e.questionKind === "spell" ? e.questionKind : undefined,
    rating,
    elapsedMs: typeof e.elapsedMs === "number" && Number.isFinite(e.elapsedMs) ? Math.max(0, e.elapsedMs) : undefined,
    dayKey: typeof e.dayKey === "string" ? e.dayKey : undefined,
    firstAttempt: Boolean(e.firstAttempt),
    newCard: Boolean(e.newCard),
    practiceOnly: Boolean(e.practiceOnly),
    before: isSrs(e.before) ? e.before : undefined,
    next: isSrs(e.next) ? e.next : undefined,
    originalEventId: typeof e.originalEventId === "string" ? e.originalEventId : undefined,
  };
}

function notifyReviewLogUpdated(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wulonvocab:review-log-updated"));
}

/** 写入失败不阻塞评分；与主库持久化一样广播可观测错误。 */
export async function writeReviewLog(event: ReviewLogEvent): Promise<void> {
  try {
    await set(`${PREFIX}${event.id}`, normalizeReviewEvent(event), reviewStore);
    notifyReviewLogUpdated();
  } catch (error) {
    console.error("[wulonvocab] 复习日志写入失败：", error);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wulonvocab:persist-error"));
  }
}

export async function listReviewLog(): Promise<ReviewLogEvent[]> {
  try {
    const allKeys = await keys(reviewStore);
    const reviewKeys = allKeys.filter((key): key is string => typeof key === "string" && key.startsWith(PREFIX));
    const events = await Promise.all(reviewKeys.map((key) => get(key, reviewStore)));
    return events
      .map(normalizeReviewEvent)
      .filter((event): event is ReviewLogEvent => event !== null)
      .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  } catch (error) {
    console.error("[wulonvocab] 复习日志读取失败：", error);
    return [];
  }
}

export async function clearReviewLog(): Promise<void> {
  const allKeys = await keys(reviewStore);
  await Promise.all(
    allKeys
      .filter((key): key is string => typeof key === "string" && key.startsWith(PREFIX))
      .map((key) => del(key, reviewStore)),
  );
  notifyReviewLogUpdated();
}

/** 撤销不删除原事件；分析时按补偿标记排除对应评分。 */
export function effectiveReviewEvents(events: ReviewLogEvent[]): ReviewLogEvent[] {
  const undone = new Set(events.filter((e) => e.kind === "undo" && e.originalEventId).map((e) => e.originalEventId as string));
  return events.filter((e) => e.kind === "review" && !undone.has(e.id));
}

export function serializeReviewLog(events: ReviewLogEvent[]): string {
  return JSON.stringify({ format: "wulonvocab-review-log", version: 1, exportedAt: Date.now(), events }, null, 2);
}
