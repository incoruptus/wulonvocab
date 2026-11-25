import { describe, expect, it } from "vitest";
import {
  MASTERY_RECENT_LIMIT,
  buildMasteryIndex,
  hasMasteryEvidence,
  masteryDimensionOf,
  masteryOf,
} from "./mastery";
import type { ReviewLogEvent } from "./reviewLog";

function event(id: string, patch: Partial<ReviewLogEvent> = {}): ReviewLogEvent {
  return {
    id,
    kind: "review",
    at: 100,
    bookId: "b1",
    entryId: "e1",
    sessionId: "s1",
    interaction: "flip",
    rating: 3,
    ...patch,
  };
}

describe("掌握层次归类", () => {
  it("看词选义属于再认，看词说义、Cloze 与隐藏词头选择属于回忆，拼写属于产出", () => {
    expect(masteryDimensionOf(event("r", { interaction: "new-recognition" }))).toBe("recognition");
    expect(masteryDimensionOf(event("r", { interaction: "new-recall" }))).toBe("recall");
    expect(masteryDimensionOf(event("r", { interaction: "flip" }))).toBe("recall");
    expect(masteryDimensionOf(event("r", { interaction: "cloze", questionKind: "cloze" }))).toBe("recall");
    expect(masteryDimensionOf(event("r", { interaction: "choice", questionKind: "word2zh" }))).toBe("recognition");
    expect(masteryDimensionOf(event("r", { interaction: "choice", questionKind: "zh2word" }))).toBe("recall");
    expect(masteryDimensionOf(event("r", { interaction: "choice", questionKind: "def2word" }))).toBe("recall");
    expect(masteryDimensionOf(event("r", { interaction: "spell" }))).toBe("production");
  });

  it("未知题型不强行归类", () => {
    expect(masteryDimensionOf(event("r", { interaction: "choice", questionKind: undefined }))).toBeNull();
    expect(masteryDimensionOf(event("r", { interaction: undefined }))).toBeNull();
  });
});

describe("掌握层次索引", () => {
  it("同会话同层只取首次评分，Hard 算成功、Again 不算", () => {
    const index = buildMasteryIndex([
      event("r1", { interaction: "new-recognition", rating: 2 }),
      event("r2", { interaction: "new-recognition", rating: 3, at: 120 }),
      event("r3", { interaction: "new-recall", rating: 3, at: 130 }),
      event("r4", { sessionId: "s2", interaction: "new-recognition", rating: 1, at: 140 }),
    ]);
    expect(masteryOf(index, "e1")).toMatchObject({
      recognition: { attempts: 2, successes: 1, lastRating: 1, lastAt: 140 },
      recall: { attempts: 1, successes: 1, lastRating: 3, lastAt: 130 },
      production: { attempts: 0, successes: 0 },
    });
  });

  it("撤销首次评分后，同会话下一次有效评分成为首次证据", () => {
    const index = buildMasteryIndex([
      event("r1", { interaction: "new-recognition", rating: 1 }),
      event("r2", { interaction: "new-recognition", rating: 2, at: 120 }),
      event("u1", { kind: "undo", originalEventId: "r1", at: 130 }),
    ]);
    expect(masteryOf(index, "e1").recognition).toMatchObject({ attempts: 1, successes: 1, lastRating: 2 });
  });

  it("每层最多保留最近 20 次，且三条层次互不合并", () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      event(`r${i}`, {
        sessionId: `s${i}`,
        interaction: "new-recognition",
        rating: i % 2 === 0 ? 2 : 1,
        at: 100 + i,
      }),
    );
    events.push(event("recall", { sessionId: "recall", interaction: "new-recall", rating: 3, at: 200 }));
    const mastery = masteryOf(buildMasteryIndex(events), "e1");
    expect(mastery.recognition.attempts).toBe(MASTERY_RECENT_LIMIT);
    expect(mastery.recognition.successes).toBe(10);
    expect(mastery.recall).toMatchObject({ attempts: 1, successes: 1 });
    expect(mastery.production.attempts).toBe(0);
  });

  it("空日志与空词条返回空证据，不产生综合分", () => {
    const mastery = masteryOf(buildMasteryIndex([]), "missing");
    expect(hasMasteryEvidence(mastery)).toBe(false);
    expect(mastery).toEqual({
      recognition: { attempts: 0, successes: 0 },
      recall: { attempts: 0, successes: 0 },
      production: { attempts: 0, successes: 0 },
    });
    expect(Object.keys(mastery)).toEqual(["recognition", "recall", "production"]);
  });
});
