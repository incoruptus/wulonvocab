import { describe, expect, it } from "vitest";
import { buildHeatmapGrid, heatmapLevel, heatmapWeeksForWidth } from "@/lib/study/heatmap";
import { ymd } from "@/lib/study/types";

const T0 = Date.parse("2026-10-13T10:00:00+08:00"); // 周二

describe("heatmapWeeksForWidth", () => {
  it("按宽度落在 13–26 周之间", () => {
    expect(heatmapWeeksForWidth(0)).toBe(13);
    expect(heatmapWeeksForWidth(280)).toBeGreaterThanOrEqual(13);
    expect(heatmapWeeksForWidth(280)).toBeLessThanOrEqual(26);
    expect(heatmapWeeksForWidth(700)).toBe(26);
    expect(heatmapWeeksForWidth(99999)).toBe(26);
  });
});

describe("heatmapLevel", () => {
  it("色阶分档", () => {
    expect(heatmapLevel(0)).toBe(0);
    expect(heatmapLevel(9)).toBe(1);
    expect(heatmapLevel(10)).toBe(2);
    expect(heatmapLevel(24)).toBe(2);
    expect(heatmapLevel(25)).toBe(3);
    expect(heatmapLevel(50)).toBe(4);
  });
});

describe("buildHeatmapGrid", () => {
  it("列数 = 周数（或补足到周一的一列），今天所在格标记 today，未来格标记 future", () => {
    const cols = buildHeatmapGrid({}, T0, 13);
    expect(cols.length).toBeGreaterThanOrEqual(13);
    expect(cols.length).toBeLessThanOrEqual(14);
    const all = cols.flatMap((c) => c.cells);
    const todayCells = all.filter((c) => c.today);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toBe(ymd(T0));
    expect(all.some((c) => c.future)).toBe(true);
    // 每列恰好 7 天、周一起步
    expect(cols.every((c) => c.cells.length === 7)).toBe(true);
    const monday = new Date(cols[0].cells[0].date + "T12:00:00");
    expect(monday.getDay()).toBe(1);
  });

  it("计数映射正确折叠进对应日期", () => {
    const counts = { [ymd(T0)]: 12, [ymd(T0 - 3 * 86400000)]: 3 };
    const cols = buildHeatmapGrid(counts, T0, 13);
    const all = cols.flatMap((c) => c.cells);
    expect(all.find((c) => c.date === ymd(T0))?.count).toBe(12);
    expect(all.find((c) => c.date === ymd(T0 - 3 * 86400000))?.count).toBe(3);
  });

  it("月份标签存在且数量合理（半年最多 7 个标签）", () => {
    const cols = buildHeatmapGrid({}, T0, 26);
    const labels = cols.filter((c) => c.label);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    expect(labels.length).toBeLessThanOrEqual(8);
    // 标签间距 ≥3 列
    const idx = cols.map((c, i) => (c.label ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < idx.length; i += 1) expect(idx[i] - idx[i - 1]).toBeGreaterThanOrEqual(3);
  });
});
