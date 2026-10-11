import { describe, expect, it } from "vitest";
import { backoffDelayMs } from "./engine";

describe("失败退避（自动同步）", () => {
  it("1m → 5m → 30m → 2h，之后封顶且负数/零按首档", () => {
    expect(backoffDelayMs(1)).toBe(60_000);
    expect(backoffDelayMs(2)).toBe(5 * 60_000);
    expect(backoffDelayMs(3)).toBe(30 * 60_000);
    expect(backoffDelayMs(4)).toBe(2 * 3600_000);
    expect(backoffDelayMs(9)).toBe(2 * 3600_000);
    expect(backoffDelayMs(0)).toBe(60_000);
  });
});
