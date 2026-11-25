import { describe, expect, it } from "vitest";
import { effectiveReviewEvents, normalizeReviewEvent, type ReviewLogEvent } from "./reviewLog";

const base: ReviewLogEvent = {
  id: "r1",
  kind: "review",
  at: 100,
  bookId: "b1",
  entryId: "e1",
  sessionId: "s1",
  mode: "new",
  interaction: "new-recognition",
  rating: 2,
  elapsedMs: 1200,
  dayKey: "2026-11-24",
  firstAttempt: true,
  newCard: true,
};

describe("review log", () => {
  it("归一化保留有效字段并拒绝损坏记录", () => {
    expect(normalizeReviewEvent(base)).toMatchObject({ id: "r1", rating: 2, interaction: "new-recognition", newCard: true });
    expect(normalizeReviewEvent({ ...base, rating: 9 })).toMatchObject({ rating: undefined });
    expect(normalizeReviewEvent({ ...base, at: Number.NaN })).toBeNull();
    expect(normalizeReviewEvent(null)).toBeNull();
  });

  it("归一化保留 Cloze、拼写与自由练习标记", () => {
    expect(normalizeReviewEvent({ ...base, mode: "cram", interaction: "cloze", questionKind: "cloze", practiceOnly: true }))
      .toMatchObject({ mode: "cram", interaction: "cloze", questionKind: "cloze", practiceOnly: true });
    expect(normalizeReviewEvent({ ...base, interaction: "spell", questionKind: "spell" }))
      .toMatchObject({ interaction: "spell", questionKind: "spell" });
  });

  it("撤销用补偿事件排除原评分，不删除原事件", () => {
    const undo: ReviewLogEvent = { id: "u1", kind: "undo", at: 200, bookId: "b1", entryId: "e1", originalEventId: "r1" };
    expect(effectiveReviewEvents([base, undo])).toEqual([]);
    expect(effectiveReviewEvents([base, undo])).not.toContain(undo);
  });

  it("只排除明确指向的评分，其他记录保持原顺序", () => {
    const second = { ...base, id: "r2", at: 150, rating: 3 as const };
    const unrelatedUndo = { id: "u2", kind: "undo" as const, at: 180, bookId: "b1", originalEventId: "missing" };
    expect(effectiveReviewEvents([base, second, unrelatedUndo]).map((e) => e.id)).toEqual(["r1", "r2"]);
  });
});
