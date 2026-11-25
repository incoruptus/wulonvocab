import { describe, expect, it } from "vitest";
import { makeEntry } from "../presets";
import type { Entry } from "../types";
import type { StudySrs } from "./types";
import { initialOf, rngFromSeed, sBucketOf, sortEntries } from "./sort";

const entry = (headword: string, patch: Partial<Entry> = {}) => makeEntry({ headword, ...patch });
const srs = (stability: number): StudySrs => ({ stability } as StudySrs);

describe("sortEntries", () => {
  it("字母正倒序、词库顺序正倒序", () => {
    const list = [entry("banana"), entry("Apple"), entry("apricot")];
    expect(sortEntries(list, "az").map((e) => e.headword)).toEqual(["Apple", "apricot", "banana"]);
    expect(sortEntries(list, "az", "desc").map((e) => e.headword)).toEqual(["banana", "apricot", "Apple"]);
    expect(sortEntries(list, "list", "desc").map((e) => e.headword)).toEqual(["apricot", "Apple", "banana"]);
  });

  it("数值维度缺失值排在前（升序）", () => {
    const list = [
      entry("a", { srs: srs(30), updatedAt: 30 }),
      entry("b", { updatedAt: 20 }),
      entry("c", { srs: srs(7), updatedAt: 10 }),
    ];
    expect(sortEntries(list, "stability").map((e) => e.headword)).toEqual(["b", "c", "a"]);
    expect(sortEntries(list, "updated", "desc").map((e) => e.headword)).toEqual(["a", "b", "c"]);
  });

  it("同 seed 的乱序可复现，且不修改输入", () => {
    const list = ["a", "b", "c", "d", "e", "f"].map((word) => entry(word));
    const before = list.map((e) => e.id);
    const a = sortEntries(list, "shuffle", "asc", { seed: 42 }).map((e) => e.headword);
    const b = sortEntries(list, "shuffle", "asc", { seed: 42 }).map((e) => e.headword);
    expect(a).toEqual(b);
    expect(a).not.toEqual(list.map((e) => e.headword));
    expect(list.map((e) => e.id)).toEqual(before);
    expect(rngFromSeed(7)()).toBe(rngFromSeed(7)());
  });

  it("首字母归一化与记忆强度分桶边界", () => {
    expect(initialOf("école")).toBe("E");
    expect(initialOf("苹果")).toBe("#");
    expect(sBucketOf(srs(0.99))).toBe("lt1");
    expect(sBucketOf(srs(1))).toBe("1to7");
    expect(sBucketOf(srs(7))).toBe("7to30");
    expect(sBucketOf(srs(30))).toBe("30to180");
    expect(sBucketOf(srs(180))).toBe("gte180");
  });
});
