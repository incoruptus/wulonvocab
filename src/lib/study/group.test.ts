import { describe, expect, it } from "vitest";
import type { Entry, Wordbook } from "../types";
import { makeEntry } from "../presets";
import { contextTagFields, groupEntries } from "./group";

function book(): Wordbook {
  return {
    ...makeBook(),
    schema: {
      version: 1,
      presetId: "test",
      sections: [
        { id: "ctx", key: "scene", label: "情景标签", type: "tags", order: 0, visible: true, options: {} },
        { id: "topic", key: "topic", label: "主题", type: "tags", order: 1, visible: true, options: {} },
      ],
    },
  };
}

function makeBook(): Wordbook {
  // 延迟到下方定义，避免为了 schema 重复构造无关字段
  return {
    id: "b",
    name: "分组测试",
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    schema: { version: 1, sections: [] },
    entries: [],
    exportSettings: {} as Wordbook["exportSettings"],
  };
}

const entry = (headword: string, patch: Partial<Entry> = {}) => makeEntry({ headword, ...patch });

describe("groupEntries", () => {
  it("词条标签 first/all 与未标记兜底", () => {
    const b = book();
    const list = [entry("a", { tags: ["校园", "高频"] }), entry("b", { tags: [] }), entry("c", { tags: ["校园"] })];
    const first = groupEntries(list, b, "tags", { tagMode: "first" });
    expect(first.map((g) => [g.label, g.entries.length])).toEqual([
      ["校园", 2],
      ["未标记", 1],
    ]);
    const all = groupEntries(list, b, "tags", { tagMode: "all" });
    expect(all.find((g) => g.label === "高频")?.entries.map((e) => e.headword)).toEqual(["a"]);
    expect(all.reduce((n, g) => n + g.entries.length, 0)).toBe(4);
  });

  it("情景标签按动态字段读取，不硬编码 contexts", () => {
    const b = book();
    expect(contextTagFields(b).map((f) => f.key)).toEqual(["scene", "topic"]);
    const groups = groupEntries([entry("a", { values: { scene: ["职场"], topic: ["沟通"] } })], b, "contextTags", { contextKey: "topic" });
    expect(groups[0].label).toBe("沟通");
  });

  it("首字母、状态、来源与空分区", () => {
    const b = book();
    const list = [
      entry("école", { status: "new" }),
      entry("苹果", { status: "learning", source: { kind: "import", at: 0 } }),
      entry("amber", { status: "mastered", source: { kind: "manual", at: 0 } }),
    ];
    expect(groupEntries(list, b, "initial").map((g) => g.label)).toEqual(["#", "A", "E"]);
    expect(groupEntries(list, b, "status", { showEmptyGroups: true })).toHaveLength(3);
    expect(groupEntries(list, b, "source").find((g) => g.label === "词典检索")).toBeUndefined();
    expect(groupEntries(list, b, "source", { showEmptyGroups: true }).find((g) => g.label === "词典检索")?.entries).toEqual([]);
  });
});
