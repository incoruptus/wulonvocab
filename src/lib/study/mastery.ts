import type { GradeValue } from "./engine";
import { effectiveReviewEvents, type ReviewLogEvent } from "./reviewLog";

export type MasteryDimension = "recognition" | "recall" | "production";
export const MASTERY_RECENT_LIMIT = 20;

export interface MasteryEvidence {
  /** 最近记录中的有效作答次数 */
  attempts: number;
  /** 其中 Hard / Good / Easy 的次数；Again 不算成功 */
  successes: number;
  lastRating?: GradeValue;
  lastAt?: number;
}

export interface EntryMastery {
  recognition: MasteryEvidence;
  recall: MasteryEvidence;
  production: MasteryEvidence;
}

export type MasteryIndex = ReadonlyMap<string, EntryMastery>;

const EMPTY_EVIDENCE: MasteryEvidence = { attempts: 0, successes: 0 };
const EMPTY_MASTERY: EntryMastery = {
  recognition: EMPTY_EVIDENCE,
  recall: EMPTY_EVIDENCE,
  production: EMPTY_EVIDENCE,
};

/** 题型决定证据属于哪一层；未知或旧日志不强行归类。 */
export function masteryDimensionOf(event: ReviewLogEvent): MasteryDimension | null {
  if (event.interaction === "new-recognition") return "recognition";
  if (event.interaction === "new-recall" || event.interaction === "flip" || event.interaction === "cloze") return "recall";
  if (event.interaction === "spell") return "production";
  if (event.interaction === "choice") {
    if (event.questionKind === "word2zh") return "recognition";
    if (event.questionKind === "zh2word" || event.questionKind === "def2word") return "recall";
  }
  return null;
}

function evidenceOf(events: ReviewLogEvent[]): MasteryEvidence {
  const recent = events.slice(-MASTERY_RECENT_LIMIT);
  const last = recent.at(-1);
  return {
    attempts: recent.length,
    successes: recent.filter((event) => (event.rating ?? 0) >= 2).length,
    ...(last?.rating ? { lastRating: last.rating } : {}),
    ...(last ? { lastAt: last.at } : {}),
  };
}

/**
 * 本机掌握层次索引：
 * - 先排除撤销补偿指向的评分；
 * - 同一词、同一会话、同一层次只取首次有效评分，避免当场反复练习虚增证据；
 * - 每层保留最近 20 次，分别计数，不合成 0–100 分；
 * - 纯函数，不写主 store、SRS、同步或备份。
 */
export function buildMasteryIndex(rawEvents: ReviewLogEvent[]): MasteryIndex {
  const events = effectiveReviewEvents(rawEvents).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const firstBySession = new Set<string>();
  const collected = new Map<string, Record<MasteryDimension, ReviewLogEvent[]>>();

  for (const event of events) {
    if (!event.entryId || !event.rating) continue;
    const dimension = masteryDimensionOf(event);
    if (!dimension) continue;
    const sessionKey = event.sessionId ?? `event:${event.id}`;
    const key = `${event.entryId}\u0000${sessionKey}\u0000${dimension}`;
    if (firstBySession.has(key)) continue;
    firstBySession.add(key);
    const byDimension = collected.get(event.entryId) ?? { recognition: [], recall: [], production: [] };
    byDimension[dimension].push(event);
    collected.set(event.entryId, byDimension);
  }

  const index = new Map<string, EntryMastery>();
  for (const [entryId, byDimension] of collected) {
    index.set(entryId, {
      recognition: evidenceOf(byDimension.recognition),
      recall: evidenceOf(byDimension.recall),
      production: evidenceOf(byDimension.production),
    });
  }
  return index;
}

export function masteryOf(index: MasteryIndex | undefined, entryId: string): EntryMastery {
  return index?.get(entryId) ?? EMPTY_MASTERY;
}

export function hasMasteryEvidence(mastery: EntryMastery): boolean {
  return mastery.recognition.attempts > 0 || mastery.recall.attempts > 0 || mastery.production.attempts > 0;
}
