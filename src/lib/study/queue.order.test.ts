import { describe, expect, it } from "vitest";
import type { Entry, Wordbook } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { applyGrade, retrievabilityOf } from "./engine";
import { buildQueue } from "./queue";
import { DEFAULT_STUDY_CONFIG, type NewWordOrder, type StudyConfig, type StudyDailyLog, type StudySrs } from "./types";

const NOW = Date.UTC(2026, 10, 17, 12);
const DAY = 86400000;

function withEntries(entries: Entry[], patch: { config?: Partial<StudyConfig>; daily?: Record<string, StudyDailyLog> } = {}): Wordbook {
  const base = createEmptyBook("顺序测试");
  return {
    ...base,
    entries,
    study: {
      config: { ...DEFAULT_STUDY_CONFIG, similarityAvoid: false, ...(patch.config ?? {}) },
      daily: patch.daily ?? {},
    },
  };
}

const entry = (headword: string) => makeEntry({ headword, createdAt: 1, updatedAt: 1 });

function reviewed(stability: number, due: number, lastReview: number): StudySrs {
  return { ...applyGrade(undefined, 3, 0.9, lastReview), stability, due, lastReview, state: 2, reps: 1 };
}

describe("buildQueue · 学习顺序", () => {
  it("五种新词顺序：先排序再取名额", () => {
    const list = [entry("delta"), entry("Apple"), entry("banana"), entry("apricot")];
    const ids = (order: NewWordOrder) =>
      buildQueue(withEntries(list, { config: { ...DEFAULT_STUDY_CONFIG, newPerDay: 2, newOrder: order, similarityAvoid: false } }), "new", NOW).map((item) => item.entryId);
    expect(ids("list")).toEqual([list[0].id, list[1].id]);
    expect(ids("listDesc")).toEqual([list[3].id, list[2].id]);
    expect(ids("az")).toEqual([list[1].id, list[3].id]);
    expect(ids("azDesc")).toEqual([list[0].id, list[2].id]);
    const shuffled = ids("shuffle");
    expect(shuffled).toHaveLength(2);
    expect(shuffled.every((id) => list.some((item) => item.id === id))).toBe(true);
  });

  it("复习按可提取性升序，最可能忘的优先", () => {
    const weak = { ...entry("weak"), srs: reviewed(7, NOW - DAY, NOW - 10 * DAY) };
    const strong = { ...entry("strong"), srs: reviewed(60, NOW - DAY, NOW - 10 * DAY) };
    const book = withEntries([strong, weak], { config: { ...DEFAULT_STUDY_CONFIG, reviewOrder: "retrievability", similarityAvoid: false } });
    expect(buildQueue(book, "review", NOW).map((item) => item.entryId)).toEqual([weak.id, strong.id]);
    expect(retrievabilityOf(weak.srs, NOW)).toBeLessThan(retrievabilityOf(strong.srs, NOW));
  });

  it("暂停与归档词库不进队列", () => {
    const book = withEntries([entry("a")]);
    expect(buildQueue({ ...book, studyState: "paused" }, "mixed", NOW)).toEqual([]);
    expect(buildQueue({ ...book, studyState: "archived" }, "mixed", NOW)).toEqual([]);
    expect(buildQueue(book, "new", NOW)).toHaveLength(1);
  });
});
