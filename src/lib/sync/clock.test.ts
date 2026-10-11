import { describe, expect, it } from "vitest";
import { compareHlc, hlcNow, hlcToString, parseHlc } from "./clock";

describe("HLC 混合逻辑时钟", () => {
  it("跨毫秒：counter 归零、ts 前进；同毫秒：counter 递增", () => {
    const a = hlcNow(null, "devA", 1000);
    expect(a).toEqual({ ts: 1000, counter: 0, deviceId: "devA" });
    const b = hlcNow(a, "devA", 1000);
    expect(b).toEqual({ ts: 1000, counter: 1, deviceId: "devA" });
    const c = hlcNow(b, "devA", 1001);
    expect(c).toEqual({ ts: 1001, counter: 0, deviceId: "devA" });
  });

  it("时钟回拨：不产出更小的 HLC", () => {
    const prev = hlcNow(null, "devA", 2000);
    const back = hlcNow(prev, "devA", 1500);
    expect(compareHlc(back, prev)).toBe(1);
    expect(back.ts).toBe(2000);
    expect(back.counter).toBe(1);
  });

  it("全序：ts → counter → deviceId 字典序；相等返回 0", () => {
    const t = { ts: 5, counter: 0, deviceId: "a" };
    expect(compareHlc(t, { ts: 6, counter: 0, deviceId: "a" })).toBe(-1);
    expect(compareHlc(t, { ts: 5, counter: 1, deviceId: "a" })).toBe(-1);
    expect(compareHlc(t, { ts: 5, counter: 0, deviceId: "b" })).toBe(-1);
    expect(compareHlc(t, { ts: 5, counter: 0, deviceId: "a" })).toBe(0);
  });

  it("序列化往返（deviceId 含冒号也可还原）", () => {
    const h = { ts: 123, counter: 4, deviceId: "dev:with:colons" };
    expect(parseHlc(hlcToString(h))).toEqual(h);
    expect(parseHlc("bad")).toBeNull();
    expect(parseHlc("x:y:z")).toBeNull();
  });
});
