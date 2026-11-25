import { createStore, del, get, keys, set } from "idb-keyval";
import type { StudySrs, QuizKind } from "./types";
import type { GradeValue } from "./engine";
import { uid } from "../utils";
import { requestSyncSoon } from "../sync/auto";

export type ReviewSessionMode = "mixed" | "review" | "new" | "cram";
export type ReviewInteraction = "flip" | "choice" | "cloze" | "new-recognition" | "new-recall" | "spell";

export interface ReviewLogContext {
  sessionId: string;
  mode: ReviewSessionMode;
  interaction: ReviewInteraction;
  questionKind?: QuizKind;
  firstAttempt?: boolean;
  newCard?: boolean;
  /** 自由练习：保留学习证据并标记 practiceOnly，不改变 SRS、每日统计，也不触发会话结束同步 */
  practiceOnly?: boolean;
}

/** 一次有效评分、撤销补偿或清空标记。原始事件按稳定 ID 同步，界面只读有效事件。 */
export interface ReviewLogEvent {
  id: string;
  kind: "review" | "undo" | "clear";
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
  const kind = e.kind === "undo" ? "undo" : e.kind === "clear" ? "clear" : "review";
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
    questionKind: e.questionKind === "word2def" || e.questionKind === "word2zh" || e.questionKind === "zh2word" || e.questionKind === "def2word" || e.questionKind === "cloze" || e.questionKind === "spell" ? e.questionKind : undefined,
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

async function readAllReviewLog(): Promise<ReviewLogEvent[]> {
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

/** 界面与统计使用：不展示 clear 标记。 */
export async function listReviewLog(): Promise<ReviewLogEvent[]> {
  return (await readAllReviewLog()).filter((event) => event.kind !== "clear");
}

/** 同步使用：保留 clear 标记，让其他设备也能应用用户主动清空。 */
export async function listReviewLogForSync(): Promise<ReviewLogEvent[]> {
  return readAllReviewLog();
}

/** 180 天且最多 5,000 条的确定性滚动保留；清空标记之后的旧事件不保留。 */
export function pruneReviewEvents(events: ReviewLogEvent[], now: number | null = null): ReviewLogEvent[] {
  const sorted = [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const cutoff = now === null ? Number.NEGATIVE_INFINITY : now - 180 * 24 * 60 * 60 * 1000;
  const clearAt = sorted.reduce((latest, event) => event.kind === "clear" ? Math.max(latest, event.at) : latest, 0);
  const kept = sorted.filter((event) => event.at >= cutoff && (event.kind === "clear" || event.at > clearAt));
  return kept.slice(-5000);
}

/** 用同步合并后的完整事件集替换本机日志，避免旧设备复活已清空事件。 */
export async function replaceReviewLog(events: ReviewLogEvent[]): Promise<void> {
  const normalized = pruneReviewEvents(events.map(normalizeReviewEvent).filter((event): event is ReviewLogEvent => event !== null), Date.now());
  const allKeys = await keys(reviewStore);
  const keep = new Set(normalized.map((event) => `${PREFIX}${event.id}`));
  await Promise.all(
    allKeys
      .filter((key): key is string => typeof key === "string" && key.startsWith(PREFIX) && !keep.has(key))
      .map((key) => del(key, reviewStore)),
  );
  await Promise.all(normalized.map((event) => set(`${PREFIX}${event.id}`, event, reviewStore)));
  notifyReviewLogUpdated();
}

export async function clearReviewLog(): Promise<void> {
  const allKeys = await keys(reviewStore);
  await Promise.all(
    allKeys
      .filter((key): key is string => typeof key === "string" && key.startsWith(PREFIX))
      .map((key) => del(key, reviewStore)),
  );
  await writeReviewLog({ id: uid(), kind: "clear", at: Date.now(), bookId: "*" });
  requestSyncSoon(3000);
}

/** 撤销不删除原事件；分析时按补偿标记排除对应评分。 */
export function effectiveReviewEvents(events: ReviewLogEvent[]): ReviewLogEvent[] {
  const undone = new Set(events.filter((e) => e.kind === "undo" && e.originalEventId).map((e) => e.originalEventId as string));
  return events.filter((e) => e.kind === "review" && !undone.has(e.id));
}

export function serializeReviewLog(events: ReviewLogEvent[]): string {
  return JSON.stringify({ format: "wulonvocab-review-log", version: 1, exportedAt: Date.now(), events }, null, 2);
}
