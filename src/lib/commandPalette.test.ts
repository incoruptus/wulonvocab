import { describe, expect, it } from "vitest";
import { buildCommands, filterCommands } from "./commandPalette";

const books = [
  { id: "b1", name: "四级特背", updatedAt: 30 },
  { id: "b2", name: "考研核心", updatedAt: 20 },
  { id: "b3", name: "雅思词汇", updatedAt: 10 },
];

describe("buildCommands", () => {
  it("包含导航/最近词库/动作/主题四组；最近词库按更新时间排序且封顶 5 个", () => {
    const cmds = buildCommands({ books, lastBookId: "b2" });
    expect(new Set(cmds.map((c) => c.group))).toEqual(new Set(["导航", "最近词库", "动作", "主题"]));
    const recent = cmds.filter((c) => c.group === "最近词库");
    expect(recent.map((c) => c.id)).toEqual(["book-b1", "book-b2", "book-b3"]);
  });

  it("有 lastBook 时提供开始学习/导出指向该书；无词库时降级为引导新建", () => {
    const withBook = buildCommands({ books, lastBookId: "b1" });
    expect(withBook.find((c) => c.id === "act-start-study")?.run).toEqual({ kind: "navigate", href: "/study?id=b1" });
    expect(withBook.find((c) => c.id === "act-export")?.run).toEqual({ kind: "navigate", href: "/book/export?id=b1" });

    const empty = buildCommands({ books: [], lastBookId: null });
    expect(empty.some((c) => c.id === "act-export")).toBe(false);
    expect(empty.find((c) => c.id === "act-start-study")?.run).toEqual({ kind: "navigate", href: "/books?new=1" });
  });
});

describe("filterCommands", () => {
  it("空查询返回全部；大小写不敏感、空格分词全包含", () => {
    const cmds = buildCommands({ books, lastBookId: "b1" });
    expect(filterCommands(cmds, "")).toHaveLength(cmds.length);
    expect(filterCommands(cmds, "导出").some((c) => c.id === "act-export")).toBe(true);
    expect(filterCommands(cmds, "study start").some((c) => c.id === "act-start-study")).toBe(true);
    expect(filterCommands(cmds, "考研").some((c) => c.id === "book-b2")).toBe(true);
    expect(filterCommands(cmds, "zzz不存在")).toHaveLength(0);
  });
});
