import { describe, expect, it } from "vitest";
import { effectiveReviewEvents, normalizeReviewEvent, pruneReviewEvents, type ReviewLogEvent } from "./reviewLog";

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

  it("四种选择题子型都保留在同步日志中", () => {
    for (const questionKind of ["word2def", "def2word", "zh2word", "word2zh"] as const) {
      expect(normalizeReviewEvent({ ...base, interaction: "choice", questionKind })).toMatchObject({ questionKind });
    }
  });

  it("滚动保留按时间稳定排序，并受 180 天与 5000 条双重限制", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 200 * day;
    const events = [
      { ...base, id: "old", at: now - 181 * day },
      { ...base, id: "b", at: now - 20 * day },
      { ...base, id: "a", at: now - 20 * day },
      { ...base, id: "recent", at: now },
    ];
    expect(pruneReviewEvents(events, now).map((event) => event.id)).toEqual(["a", "b", "recent"]);
    expect(pruneReviewEvents(events, now)).toEqual(pruneReviewEvents([...events].reverse(), now));
    const many = Array.from({ length: 5002 }, (_, index) => ({ ...base, id: `r${String(index).padStart(4, "0")}`, at: index }));
    expect(pruneReviewEvents(many)).toHaveLength(5000);
    expect(pruneReviewEvents(many)[0].id).toBe("r0002");
  });

  it("清空标记传播并删除更早事件，之后的评分仍有效", () => {
    const clear: ReviewLogEvent = { id: "c1", kind: "clear", at: 300, bookId: "*" };
    const after = { ...base, id: "r2", at: 400 };
    expect(pruneReviewEvents([base, clear, after])).toEqual([clear, after]);
    expect(effectiveReviewEvents(pruneReviewEvents([base, clear, after]))).toEqual([after]);
    expect(pruneReviewEvents([{ ...base, at: 300 }, clear])).toEqual([clear]);
  });
});
