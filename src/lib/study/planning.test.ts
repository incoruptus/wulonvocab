import { describe, expect, it } from "vitest";
import { createEmptyBook, makeEntry } from "../presets";
import type { Wordbook } from "../types";
import { newSrs } from "./engine";
import { computeStudyPlan, daysUntilExam, prioritizeWeakReviews, weaknessOf } from "./planning";
import { DEFAULT_STUDY_CONFIG } from "./types";

const NOW = new Date(2026, 10, 24, 12).getTime();

function bookWith(entries: ReturnType<typeof makeEntry>[], config: Partial<typeof DEFAULT_STUDY_CONFIG> = {}): Wordbook {
  const book = createEmptyBook("计划测试");
  return {
    ...book,
    entries,
    study: { config: { ...DEFAULT_STUDY_CONFIG, ...config }, daily: {} },
  };
}

function reviewed(lapses = 0, stability = 10) {
  const entry = makeEntry({ headword: `word-${lapses}-${stability}` });
  entry.srs = { ...newSrs(NOW - 20 * 86400000), due: NOW - 86400000, lastReview: NOW - 86400000, reps: 3, lapses, stability, difficulty: 5, state: 2, scheduledDays: stability };
  return entry;
}

describe("规则档每日计划", () => {
  it("时间充足时不超过用户配置的每日上限", () => {
    const book = bookWith([makeEntry({ headword: "fresh" }), makeEntry({ headword: "fresh" }), reviewed()], { newPerDay: 15, reviewPerDay: 200, dailyMinutes: 60 });
    const plan = computeStudyPlan(book, NOW);
    expect(plan.reviews).toBe(1);
    expect(plan.newWords).toBe(2);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(60);
  });

  it("预算紧张时先减新词，并保留积压而不改 due", () => {
    const entries = Array.from({ length: 12 }, () => reviewed());
    entries.push(makeEntry({ headword: "fresh" }), makeEntry({ headword: "fresh" }));
    const before = entries.map((entry) => entry.srs?.due);
    const plan = computeStudyPlan(bookWith(entries, { dailyMinutes: 10 }), NOW);
    expect(plan.newWords).toBe(0);
    expect(plan.reviews).toBeLessThan(12);
    expect(plan.backlog).toBeGreaterThan(0);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(10);
    expect(entries.map((entry) => entry.srs?.due)).toEqual(before);
  });

  it("关闭规则档后保留原配置负载", () => {
    const book = bookWith(Array.from({ length: 30 }, () => reviewed()), { adaptivePlan: false, dailyMinutes: 5, reviewPerDay: 200 });
    expect(computeStudyPlan(book, NOW).reviews).toBe(30);
  });

  it("考试前两周进一步压缩新词", () => {
    const date = new Date(NOW + 10 * 86400000);
    const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const book = bookWith([makeEntry({ headword: "fresh" }), makeEntry({ headword: "fresh" }), makeEntry({ headword: "fresh" }), reviewed()], { newPerDay: 20, dailyMinutes: 60, examDate: dateText });
    const plan = computeStudyPlan(book, NOW);
    expect(plan.reason).toBe("exam");
    expect(plan.newWords).toBeLessThanOrEqual(3);
    expect(plan.reviews).toBe(1);
  });

  it("考试日期按本地日历计算并拒绝无效日期", () => {
    expect(daysUntilExam("2026-11-26", NOW)).toBe(2);
    expect(daysUntilExam("2026-02-30", NOW)).toBeUndefined();
    expect(daysUntilExam("not-a-date", NOW)).toBeUndefined();
  });
});

describe("弱词优先", () => {
  it("遗忘次数、低可检索度与最近错误提高排序分数", () => {
    const weak = reviewed(5, 2);
    const strong = reviewed(0, 80);
    const weakScore = weaknessOf(weak, NOW, 0.9, { recentAgain: true });
    const strongScore = weaknessOf(strong, NOW, 0.9);
    expect(weakScore.score).toBeGreaterThan(strongScore.score);
    expect(weakScore.recentAgain).toBe(true);
  });

  it("最多把 20% 候选放到前面且不丢词", () => {
    const entries = Array.from({ length: 10 }, (_, i) => reviewed(i === 9 ? 8 : 0, i === 9 ? 1 : 40));
    const items = entries.map((entry) => ({ entryId: entry.id, isNew: false }));
    const result = prioritizeWeakReviews(items, entries, new Map(), NOW, 0.9, 20);
    expect(result).toHaveLength(10);
    expect(new Set(result.map((item) => item.entryId)).size).toBe(10);
    expect(result[0].entryId).toBe(entries[9].id);
    expect(result.slice(1).map((item) => item.entryId)).toEqual(entries.slice(0, 9).map((entry) => entry.id));
  });

  it("小队列也只允许一个弱词插到前面", () => {
    const entries = [reviewed(), reviewed(6, 1)];
    const result = prioritizeWeakReviews(entries.map((entry) => ({ entryId: entry.id })), entries, new Map(), NOW, 0.9);
    expect(result[0].entryId).toBe(entries[1].id);
  });

  it("慢而对只提供轻微排序信号", () => {
    const entry = reviewed(0, 40);
    const base = weaknessOf(entry, NOW, 0.9).score;
    const slow = weaknessOf(entry, NOW, 0.9, { slowSuccess: true }).score;
    expect(slow - base).toBeLessThanOrEqual(5);
    expect(entry.srs?.lapses).toBe(0);
  });
});
