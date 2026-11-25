import { describe, expect, it } from "vitest";
import { createEmptyBook, makeEntry } from "../presets";
import type { Wordbook } from "../types";
import { batchGroups, buildBatchQueue, clampBatchSize, frequencyOf } from "./batch";
import { newSrs } from "./engine";
import { DEFAULT_STUDY_CONFIG } from "./types";

const NOW = new Date(2026, 10, 24, 12).getTime();

function fixture(): Wordbook {
  const book = createEmptyBook("批次测试");
  book.study = { config: { ...DEFAULT_STUDY_CONFIG, newPerDay: 20, reviewPerDay: 200 }, daily: {} };
  book.entries = Array.from({ length: 12 }, (_, index) => makeEntry({
    headword: `batchword${index}`,
    values: { contexts: index < 6 ? ["校园"] : ["职场"] },
    source: { kind: index < 6 ? "manual" : "import", label: index < 6 ? "手动" : "导入", at: NOW },
  }));
  return book;
}

function reviewed(book: Wordbook, index: number, stability: number) {
  book.entries[index].srs = {
    ...newSrs(NOW - 30 * 86400000),
    due: NOW - 86400000,
    lastReview: NOW - 86400000,
    stability,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: 2,
    scheduledDays: stability,
  };
}

describe("学习批次", () => {
  it("默认大小为 8，并限制在 5–10", () => {
    expect(clampBatchSize(undefined)).toBe(8);
    expect(clampBatchSize(1)).toBe(5);
    expect(clampBatchSize(99)).toBe(10);
    expect(buildBatchQueue(fixture(), { dimension: "random" }, "cram", NOW, { rng: () => 0.2 })).toHaveLength(8);
  });

  it("情景标签新词批次只取对应主题", () => {
    const book = fixture();
    const items = buildBatchQueue(book, { dimension: "contextTags", contextKey: "contexts", key: "校园" }, "new", NOW);
    expect(items).toHaveLength(6);
    expect(items.every((item) => item.newWord)).toBe(true);
    expect(items.every((item) => (book.entries.find((entry) => entry.id === item.entryId)?.values.contexts as string[] | undefined)?.includes("校园"))).toBe(true);
  });

  it("来源批次与频率批次使用各自维度", () => {
    const book = fixture();
    book.schema.sections.push({ id: "freq", key: "frequency", label: "考频", type: "text", order: 99, visible: true, options: {} });
    book.entries.forEach((entry, index) => { entry.values.frequency = String(index < 6 ? 3 : 1); });
    expect(frequencyOf(book.entries[0], book)).toBe(3);
    expect(batchGroups(book).some((group) => group.dimension === "frequency")).toBe(true);
    expect(buildBatchQueue(book, { dimension: "source", key: "import" }, "cram", NOW, { rng: () => 0.5 })).toHaveLength(6);
    expect(buildBatchQueue(book, { dimension: "frequency", key: "3" }, "cram", NOW, { rng: () => 0.5 })).toHaveLength(6);
  });

  it("复习批次按可检索度升序，不按标签聚堆", () => {
    const book = fixture();
    book.entries.forEach((_, index) => reviewed(book, index, 40 - index));
    const items = buildBatchQueue(book, { dimension: "random" }, "review", NOW, { allowSimilar: true });
    const ids = items.map((item) => item.entryId);
    expect(ids).toEqual([...book.entries].reverse().slice(0, 8).map((entry) => entry.id));
    expect(items.every((item) => !item.isNew)).toBe(true);
  });

  it("暂停与归档阻断计划队列，但保留自由练习", () => {
    const book = fixture();
    book.studyState = "paused";
    expect(buildBatchQueue(book, { dimension: "random" }, "new", NOW)).toEqual([]);
    expect(buildBatchQueue(book, { dimension: "random" }, "review", NOW)).toEqual([]);
    expect(buildBatchQueue(book, { dimension: "random" }, "cram", NOW, { rng: () => 0.5 })).toHaveLength(8);
    book.studyState = "archived";
    expect(buildBatchQueue(book, { dimension: "random" }, "cram", NOW, { rng: () => 0.5 })).toHaveLength(8);
  });

  it("搁置词不进入任何批次", () => {
    const book = fixture();
    book.entries[0].suspension = { until: NOW + 86400000, at: NOW };
    for (const intent of ["new", "review", "cram"] as const) {
      expect(buildBatchQueue(book, { dimension: "random" }, intent, NOW, { rng: () => 0.5 }).some((item) => item.entryId === book.entries[0].id)).toBe(false);
    }
  });

  it("新词批次尊重当天剩余名额", () => {
    const book = fixture();
    book.study!.daily["2026-11-24"] = { added: 18, reviewed: 0, again: 0, hard: 0, good: 0, easy: 0, ms: 0 };
    expect(buildBatchQueue(book, { dimension: "random" }, "new", NOW)).toHaveLength(2);
  });
});
