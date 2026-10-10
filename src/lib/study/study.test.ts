import { describe, expect, it } from "vitest";
import {
  applyGrade,
  clampReviewNow,
  formatInterval,
  isDue,
  isMastered,
  isNewSrs,
  newSrs,
  needsSessionRequeue,
  previewGrades,
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
} from "@/lib/study/engine";
import { buildQueue, studyOverview } from "@/lib/study/queue";
import { DEFAULT_STUDY_CONFIG, ymd, type StudyConfig, type StudyDailyLog } from "@/lib/study/types";
import { makeEntry } from "@/lib/presets";

const T0 = Date.parse("2026-10-10T04:00:00Z");

describe("formatInterval", () => {
  it("分钟 / 小时 / 天 / 月 / 年", () => {
    expect(formatInterval(30 * 1000)).toBe("<1 分钟");
    expect(formatInterval(10 * 60 * 1000)).toBe("10 分钟");
    expect(formatInterval(3 * 3600 * 1000)).toBe("3 小时");
    expect(formatInterval(2 * 86400 * 1000)).toBe("2 天");
    expect(formatInterval(60 * 86400 * 1000)).toBe("2 个月");
    expect(formatInterval(400 * 86400 * 1000)).toBe("1.1 年");
  });
});

describe("applyGrade（FSRS 行为）", () => {
  it("新卡 Good → 进入学习态，10 分钟后到期", () => {
    const next = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    expect(next.state).toBe(1); // Learning
    expect(next.due - T0).toBeGreaterThanOrEqual(9 * 60 * 1000);
    expect(next.due - T0).toBeLessThanOrEqual(11 * 60 * 1000);
    expect(next.reps).toBe(1);
  });

  it("再次 Good → 毕业进入复习态（间隔 ≥ 1 天）", () => {
    const first = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    const second = applyGrade(first, RATING_GOOD, 0.9, first.due);
    expect(second.state).toBe(2); // Review
    expect(second.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("Easy 直接给出长间隔且状态为复习", () => {
    const next = applyGrade(undefined, RATING_EASY, 0.9, T0);
    expect(next.state).toBe(2);
    expect(next.scheduledDays).toBeGreaterThanOrEqual(4);
  });

  it("Again 保持在学习态且 lapses 记录", () => {
    const first = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    const lapse = applyGrade(first, RATING_AGAIN, 0.9, first.due);
    expect([1, 3]).toContain(lapse.state); // Learning / Relearning
    expect(lapse.due - first.due).toBeLessThanOrEqual(2 * 60 * 1000);
  });

  it("previewGrades 与 applyGrade 在同一时刻结果一致（共享时间戳）", () => {
    const card = newSrs(T0);
    const preview = previewGrades(card, 0.9, T0).find((p) => p.rating === RATING_GOOD)!;
    const applied = applyGrade(card, RATING_GOOD, 0.9, T0);
    expect(Math.abs(preview.dueTs - applied.due)).toBeLessThanOrEqual(2000);
  });

  it("时钟回拨保护：now 早于 lastReview 时被钳制", () => {
    const card = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    const clamped = clampReviewNow(card, T0 - 86400000);
    expect(clamped).toBe((card.lastReview ?? T0) + 1000);
  });
});

describe("isDue / isMastered / needsSessionRequeue", () => {
  it("状态判定", () => {
    expect(isNewSrs(undefined)).toBe(true);
    const learning = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    expect(isNewSrs(learning)).toBe(false);
    expect(isDue(learning, T0 + 60 * 60 * 1000)).toBe(true);
    expect(isDue(learning, T0 + 1000)).toBe(false);
    expect(needsSessionRequeue(learning, T0 + 60 * 1000)).toBe(true);
    expect(isMastered({ ...learning, state: 2, scheduledDays: 30 })).toBe(true);
  });
});

describe("buildQueue / studyOverview", () => {
  const cfg: StudyConfig = { ...DEFAULT_STUDY_CONFIG, newPerDay: 2, reviewPerDay: 1 };

  function makeBook(entries: ReturnType<typeof makeEntry>[]) {
    return {
      id: "b1",
      name: "t",
      tags: [],
      createdAt: T0,
      updatedAt: T0,
      schema: { version: 1 as const, sections: [] },
      entries,
      exportSettings: {} as never,
      study: { config: cfg, daily: {} as Record<string, StudyDailyLog> },
    };
  }

  it("复习受每日上限约束、按到期先后排序；新词受 newPerDay 约束", () => {
    const e1 = makeEntry({ headword: "a", srs: { ...newSrs(T0), state: 2, reps: 3, due: T0 - 1000 } });
    const e2 = makeEntry({ headword: "b", srs: { ...newSrs(T0), state: 2, reps: 3, due: T0 - 5000 } });
    const e3 = makeEntry({ headword: "c" });
    const e4 = makeEntry({ headword: "d" });
    const e5 = makeEntry({ headword: "e" });
    const book = makeBook([e1, e2, e3, e4, e5]);

    const q = buildQueue(book as never, "mixed", T0);
    // reviewPerDay=1 → 只取最早到期的 e2；newPerDay=2 → c、d
    expect(q.map((x) => x.entryId)).toEqual([e2.id, e3.id, e4.id]);
    expect(q[0].isNew).toBe(false);

    const ov = studyOverview(book as never, T0);
    expect(ov.due).toBe(2);
    expect(ov.newRemaining).toBe(2);
    expect(ov.learning).toBe(2);
  });

  it("当日已学新词会扣减剩余额度", () => {
    const book = makeBook([makeEntry({ headword: "c" })]);
    book.study.daily[ymd(T0)] = { added: 2, reviewed: 2, again: 0, hard: 0, good: 2, easy: 0, ms: 0 };    const ov = studyOverview(book as never, T0);
    expect(ov.newRemaining).toBe(0);
    expect(buildQueue(book as never, "new", T0)).toHaveLength(0);
  });
});
