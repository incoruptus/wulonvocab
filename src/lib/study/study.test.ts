import { describe, expect, it } from "vitest";
import {
  applyGrade,
  clampReviewNow,
  formatInterval,
  isDue,
  isMastered,
  isNewSrs,
  newSrs,
  previewGrades,
  shouldRequeueInSession,
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
} from "@/lib/study/engine";
import { buildQueue, studyOverview } from "@/lib/study/queue";
import { DEFAULT_STUDY_CONFIG, pruneDaily, ymd, type StudyConfig, type StudyDailyLog } from "@/lib/study/types";
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

describe("isDue / isMastered / shouldRequeueInSession", () => {
  it("状态判定", () => {
    expect(isNewSrs(undefined)).toBe(true);
    const learning = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    expect(isNewSrs(learning)).toBe(false);
    expect(isDue(learning, T0 + 60 * 60 * 1000)).toBe(true);
    expect(isDue(learning, T0 + 1000)).toBe(false);
    expect(isMastered({ ...learning, state: 2, scheduledDays: 30 })).toBe(true);
  });

  it("回炉只在「忘记」且仍处于学习/重学步时发生（模糊/记得即本轮通过）", () => {
    const learning = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    expect(shouldRequeueInSession(learning, RATING_AGAIN)).toBe(true);
    expect(shouldRequeueInSession(learning, 2)).toBe(false);
    expect(shouldRequeueInSession(learning, RATING_GOOD)).toBe(false);
    // 复习态忘记 → 进入重学（Relearning）→ 同样回炉（用真实状态链构造，避免伪造卡片的自洽性问题）
    const learned = applyGrade(undefined, RATING_GOOD, 0.9, T0);
    const review = applyGrade(learned, RATING_GOOD, 0.9, learned.due);
    expect(review.state).toBe(2); // Review
    const relearn = applyGrade(review, RATING_AGAIN, 0.9, review.due);
    expect(relearn.state).toBe(3); // Relearning
    expect(shouldRequeueInSession(relearn, RATING_AGAIN)).toBe(true);
    // 复习态（稳定）非忘记：不回炉
    expect(shouldRequeueInSession(review, RATING_GOOD)).toBe(false);
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

  it("随机乱序（order=shuffle）：rng 注入可复现、不丢项", () => {
    const entries = ["a", "b", "c", "d", "e", "f"].map((h) => makeEntry({ headword: h }));
    const base = makeBook(entries);
    const book = { ...base, study: { config: { ...base.study.config, newPerDay: 6 }, daily: {} as Record<string, StudyDailyLog> } };
    const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2];
    const run = () => {
      let i = 0;
      return buildQueue(book as never, "new", T0, { order: "shuffle", rng: () => seq[i++ % seq.length] }).map((x) => x.entryId);
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // 相同 rng 序列 → 相同顺序（可复现）
    expect(new Set(a).size).toBe(6); // 不丢项
  });
});

describe("边界：到期判定 / 时钟回拨 / 日志裁剪（审计盲区）", () => {
  it("isDue：到期整点算到期；未来一刻不算；无 srs 与新卡不算", () => {
    const review = { ...newSrs(T0), state: 2, reps: 3 };
    expect(isDue({ ...review, due: T0 }, T0)).toBe(true);
    expect(isDue({ ...review, due: T0 + 1 }, T0)).toBe(false);
    expect(isDue(undefined, T0)).toBe(false);
    expect(isDue(newSrs(T0), T0)).toBe(false); // New 不参与到期
  });

  it("clampReviewNow：时钟回拨/同一毫秒钳到 last+1s；正常时间原样；无记录原样", () => {
    const srs = { ...newSrs(T0), lastReview: T0 };
    expect(clampReviewNow(srs, T0 - 5000)).toBe(T0 + 1000);
    expect(clampReviewNow(srs, T0)).toBe(T0 + 1000);
    expect(clampReviewNow(srs, T0 + 5000)).toBe(T0 + 5000);
    expect(clampReviewNow(undefined, T0)).toBe(T0);
  });

  it("pruneDaily：≤180 条原样返回（同引用）；超出只留字典序最近 180 条", () => {
    const mk = (day: number): StudyDailyLog => ({ added: 0, reviewed: day, again: 0, hard: 0, good: 0, easy: 0, ms: 0 });
    const days: Record<string, StudyDailyLog> = {};
    for (let i = 0; i < 200; i += 1) days[String(i).padStart(3, "0")] = mk(i);
    const pruned = pruneDaily(days, T0);
    expect(Object.keys(pruned)).toHaveLength(180);
    expect(pruned["000"]).toBeUndefined();
    expect(pruned["199"]).toBeDefined();

    const exact = Object.fromEntries(Object.entries(days).slice(20));
    expect(Object.keys(exact)).toHaveLength(180);
    expect(pruneDaily(exact, T0)).toBe(exact);
  });
});
