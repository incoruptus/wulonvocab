import { describe, expect, it } from "vitest";
import type { SectionDef } from "../types";
import { buildValueDiff, summarizeValue } from "./diff";

const sec = (key: string, type: SectionDef["type"], order: number, label = key): SectionDef => ({
  id: `id-${key}`,
  key,
  label,
  type,
  order,
  visible: true,
  options: {},
});

describe("summarizeValue", () => {
  it("常见字段类型产出可读单行摘要", () => {
    expect(summarizeValue("text", "一句话")).toBe("一句话");
    expect(summarizeValue("tags", ["核心", "考研"])).toBe("核心，考研");
    expect(summarizeValue("senses", [{ pos: "v.", translation: "抛弃" }])).toBe("v.抛弃");
    expect(summarizeValue("table", { columns: ["英", "美"], rows: [["a", "b"]] })).toBe("1 行 × 2 列");
    expect(summarizeValue("rating", { value: 4, max: 5 })).toBe("4 / 5");
    expect(summarizeValue("list", [])).toBe("（空）");
  });
});

describe("buildValueDiff", () => {
  const sections = [sec("phonetic", "pronunciation", 0, "音标"), sec("senses", "senses", 1, "释义"), sec("tags", "tags", 2)];

  it("空值 → 新增（new）；已有值 → 覆盖（conflict）；相同值不出现", () => {
    const rows = buildValueDiff(
      { senses: [{ pos: "n.", translation: "旧" }], tags: ["核心"] },
      { phonetic: { uk: "/əˈbændən/" }, senses: [{ pos: "n.", translation: "新" }], tags: ["核心"] },
      sections,
    );
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ["phonetic", "new"],
      ["senses", "conflict"],
    ]);
  });

  it("按 schema 顺序输出；未知键忽略", () => {
    const rows = buildValueDiff({}, { tags: ["a"], phonetic: { uk: "/x/" }, unknownKey: "x" }, sections);
    expect(rows.map((r) => r.key)).toEqual(["phonetic", "tags"]);
  });
});
