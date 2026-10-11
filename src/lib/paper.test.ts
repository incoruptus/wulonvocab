import { describe, expect, it } from "vitest";
import { computeGeometry } from "./paper";

const baseMargin = { top: 14, right: 12, bottom: 14, left: 12, gutter: 0, mirror: false };

describe("computeGeometry 装订留白（回归：渲染列不得被 flex 压缩）", () => {
  it("gutter 从内容宽扣除，内容高不受影响", () => {
    const g0 = computeGeometry("A5", "portrait", baseMargin, 1, 0);
    const g5 = computeGeometry("A5", "portrait", { ...baseMargin, gutter: 5 }, 1, 0);
    expect(g0.content.width - g5.content.width).toBeCloseTo(5, 5);
    expect(g5.content.height).toBe(g0.content.height);
  });

  it("多栏列宽总和 + 栏间距 === 内容宽（含 gutter）", () => {
    const g = computeGeometry("A4", "portrait", { ...baseMargin, gutter: 3 }, 2, 8);
    expect(g.columnWidth * 2 + 8).toBeCloseTo(g.content.width, 5);
  });
});
