import { describe, expect, it } from "vitest";
import { normalizeRating } from "./sections";

describe("normalizeRating（回归：x/y 写法被拼成 45 的问题）", () => {
  it("x/y 按分数解析而非去符号拼接", () => {
    expect(normalizeRating("4/5")).toEqual({ value: 4, max: 5 });
    expect(normalizeRating("3.5/5")).toEqual({ value: 4, max: 5 });
    expect(normalizeRating("7/10")).toEqual({ value: 7, max: 10 });
    expect(normalizeRating("8 / 10")).toEqual({ value: 8, max: 10 });
  });

  it("星级与纯数字照旧，且星级不再可能越界", () => {
    expect(normalizeRating("★★★")).toEqual({ value: 3, max: 5 });
    expect(normalizeRating("3")).toEqual({ value: 3, max: 5 });
    expect(normalizeRating(4)).toEqual({ value: 4, max: 5 });
  });
});
