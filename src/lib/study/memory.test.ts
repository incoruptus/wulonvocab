import { describe, expect, it } from "vitest";
import { memoryStateLabel, newSrs, r30Of } from "./engine";

const now = Date.parse("2026-11-24T12:00:00Z");
function reviewSrs(stability: number, scheduledDays = stability) {
  return { ...newSrs(now), state: 2, reps: 2, stability, scheduledDays, lastReview: now, due: now + scheduledDays * 86400000 };
}

describe("memory display", () => {
  it("R(30) 与已拍板的示例一致", () => {
    expect(Math.round((r30Of(reviewSrs(21), now) ?? 0) * 100)).toBe(87);
    expect(Math.round((r30Of(reviewSrs(60), now) ?? 0) * 100)).toBe(94);
    expect(Math.round((r30Of(reviewSrs(180), now) ?? 0) * 100)).toBe(98);
  });

  it("新词没有 R(30)，状态枚举语义不变", () => {
    expect(r30Of(undefined, now)).toBeNull();
    expect(r30Of(newSrs(now), now)).toBeNull();
    expect(memoryStateLabel(undefined)).toBe("新词");
    expect(memoryStateLabel(reviewSrs(10))).toBe("学习中");
    expect(memoryStateLabel(reviewSrs(21))).toBe("稳固（当前）");
  });
});
