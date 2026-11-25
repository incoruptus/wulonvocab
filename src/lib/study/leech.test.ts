import { describe, expect, it } from "vitest";
import type { Entry } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { parseImportJson, rowsToEntries } from "../importer";
import { serializeBookDoc } from "../serializers";
import {
  DAY_MS,
  DEFAULT_LEECH_THRESHOLD,
  clampLeechThreshold,
  halfLeechThreshold,
  isEntrySuspended,
  leechInfoOf,
  sanitizeSuspension,
  suspensionForDays,
} from "./leech";

const base: Pick<Entry, "srs" | "suspension"> = {
  srs: {
    due: 10,
    stability: 3,
    difficulty: 7,
    elapsedDays: 2,
    scheduledDays: 3,
    reps: 8,
    lapses: 4,
    state: 2,
    learningSteps: 0,
  },
};

describe("顽固词阈值", () => {
  it("默认 8，半阈值向上取整，异常值被钳制", () => {
    expect(DEFAULT_LEECH_THRESHOLD).toBe(8);
    expect(halfLeechThreshold(8)).toBe(4);
    expect(halfLeechThreshold(9)).toBe(5);
    expect(clampLeechThreshold("8")).toBe(8);
    expect(clampLeechThreshold(1)).toBe(2);
    expect(clampLeechThreshold(99)).toBe(20);
  });

  it("半阈值预告与正式标记使用同一阈值", () => {
    expect(leechInfoOf({ ...base, srs: { ...base.srs!, lapses: 3 } }, 100, 8).level).toBe("none");
    expect(leechInfoOf(base, 100, 8).level).toBe("warning");
    expect(leechInfoOf({ ...base, srs: { ...base.srs!, lapses: 8 } }, 100, 8).level).toBe("leech");
  });
});

describe("搁置", () => {
  it("7 / 30 天使用固定时长，到期边界自动恢复", () => {
    const seven = suspensionForDays(7, 1_000);
    const thirty = suspensionForDays(30, 1_000);
    expect(seven.until - seven.at).toBe(7 * DAY_MS);
    expect(thirty.until - thirty.at).toBe(30 * DAY_MS);
    expect(isEntrySuspended({ suspension: seven }, seven.until - 1)).toBe(true);
    expect(isEntrySuspended({ suspension: seven }, seven.until)).toBe(false);
    expect(leechInfoOf({ suspension: thirty }, 1_000, 8).level).toBe("suspended");
  });

  it("搁置优先于顽固词展示，到期后重新显示顽固词", () => {
    const suspension = suspensionForDays(7, 100);
    const entry = { ...base, suspension, srs: { ...base.srs!, lapses: 9 } };
    expect(leechInfoOf(entry, 200, 8).level).toBe("suspended");
    expect(leechInfoOf(entry, suspension.until, 8).level).toBe("leech");
  });

  it("导入净化拒绝畸形记录", () => {
    expect(sanitizeSuspension({ at: 10, until: 20 })).toEqual({ at: 10, until: 20 });
    expect(sanitizeSuspension({ at: 20, until: 20 })).toBeUndefined();
    expect(sanitizeSuspension({ at: "10", until: 20 })).toBeUndefined();
    expect(sanitizeSuspension({ at: 10, until: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(sanitizeSuspension(null)).toBeUndefined();
  });

  it("标准文档导出与重新导入保留搁置记录", () => {
    const suspension = { at: 100, until: 100 + 7 * DAY_MS };
    const entry = makeEntry({ id: "e1", headword: "lapse", createdAt: 0, updatedAt: 0, suspension });
    const book = { ...createEmptyBook("往返"), entries: [entry] };
    const parsed = parseImportJson(serializeBookDoc(book));
    const result = rowsToEntries(parsed, book.schema);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].suspension).toEqual(suspension);
  });
});
