import { describe, expect, it } from "vitest";
import { paginate, paginateGrid, type MeasuredBlock } from "@/lib/export/paginate";

const block = (id: string, entryId: string, height: number, extra: Partial<MeasuredBlock> = {}): MeasuredBlock => ({
  id,
  entryId,
  kind: "section",
  height,
  ...extra,
});

describe("paginate", () => {
  it("顺序填充并在放不下时换列", () => {
    const blocks = [
      block("a", "e1", 400, { kind: "header", gapBefore: 0 }),
      block("b", "e1", 400, { gapBefore: 20 }),
      block("c", "e2", 300, { kind: "header", gapBefore: 60 }),
    ];
    const result = paginate(blocks, { columns: 2, columnHeight: 1000 });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a", "b"]);
    // c 放不下第一列（400+20+400+60+300=1180 > 1000）→ 第二列
    expect(result.pages[0].slots[1].map((b) => b.id)).toEqual(["c"]);
    expect(result.entryFirstPage["e2"]).toBe(0);
  });

  it("分栏溢出到下一页", () => {
    const blocks = [block("a", "e1", 600), block("b", "e2", 600), block("c", "e3", 600)];
    const result = paginate(blocks, { columns: 2, columnHeight: 1000, gap: 0 });
    expect(result.pages).toHaveLength(2);
    expect(result.entryFirstPage["e3"]).toBe(1);
  });

  it("可拆分块按单元续排并标记（续）", () => {
    const split = {
      header: 40,
      units: [
        { from: 0, to: 1, h: 300 },
        { from: 1, to: 2, h: 300 },
        { from: 2, to: 3, h: 300 },
      ],
    };
    const blocks: MeasuredBlock[] = [
      { id: "h1", entryId: "e1", kind: "header", height: 60, glueWithNext: true },
      { id: "s1", entryId: "e1", kind: "section", height: 940, split, gapBefore: 20 },
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    expect(result.pages).toHaveLength(2);
    const firstPageBlocks = result.pages[0].slots[0];
    const secondPageBlocks = result.pages[1].slots[0];
    expect(firstPageBlocks[1].slice).toEqual([0, 2]);
    expect(secondPageBlocks[0].slice).toEqual([2, 3]);
    expect(secondPageBlocks[0].continued).toBe(true);
  });

  it("孤行控制：头部与首单元同列", () => {
    const split = {
      header: 40,
      units: [{ from: 0, to: 1, h: 700 }],
    };
    const blocks: MeasuredBlock[] = [
      block("x", "e0", 600),
      { id: "h1", entryId: "e1", kind: "header", height: 60, glueWithNext: true },
      { id: "s1", entryId: "e1", kind: "section", height: 740, split },
    ];
    // 第一列剩 400：头部 60 + 首单元 740 放不下 → 头与块一起挪到第二列
    const result = paginate(blocks, { columns: 2, columnHeight: 1000 });
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["x"]);
    expect(result.pages[0].slots[1].map((b) => b.id)).toEqual(["h1", "s1"]);
  });

  it("超过整页的单元被强行放置并计数", () => {
    const split = { header: 40, units: [{ from: 0, to: 1, h: 2000 }] };
    const blocks: MeasuredBlock[] = [{ id: "s1", entryId: "e1", kind: "section", height: 2040, split }];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    expect(result.overflowBlocks).toBe(1);
    expect(result.pages[0].slots[0]).toHaveLength(1);
  });

  it("题头模式：整词放不下时题头落到新页开头（旧版孤头页回归测试）", () => {
    // 第 1 页已有 650 高内容；e2 整词 60+8+40+8+300=416 > 剩余 350
    // → e2 的题头移动到第 2 页开头，而不是留在第 1 页底部、内容被推到下一页
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 650),
      { id: "h2", entryId: "e2", kind: "header", height: 60, glueWithNext: true },
      block("p2", "e2", 40, { gapBefore: 8 }),
      block("s2", "e2", 300, { gapBefore: 8 }),
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    const pageOf = (id: string) => {
      for (const page of result.pages) {
        for (const slotBlocks of page.slots) {
          if (slotBlocks.some((b) => b.id === id)) return page.index;
        }
      }
      return -1;
    };
    expect(pageOf("a")).toBe(0);
    expect(pageOf("h2")).toBe(1); // 题头不再孤立在第 1 页
    expect(pageOf("s2")).toBe(1); // 题头与首个内容块同页
  });

  it("词条起始保护：整词放得下时不移动", () => {
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 200),
      { id: "h2", entryId: "e2", kind: "header", height: 60, glueWithNext: true },
      block("p2", "e2", 40, { gapBefore: 8 }),
      block("s2", "e2", 300, { gapBefore: 8 }),
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a", "h2", "p2", "s2"]);
  });

  it("题头模式：整词总高放得下时不移动；放不下（哪怕只是首段能放）则整体移到新页开头", () => {
    const split = { header: 16, units: [{ from: 0, to: 1, h: 300 }] };
    const familySplit = { header: 16, units: [{ from: 0, to: 1, h: 40 }] };
    const build = (aHeight: number): MeasuredBlock[] => [
      block("a", "e1", aHeight),
      { id: "h2", entryId: "e2", kind: "header", height: 60, glueWithNext: true },
      block("p2", "e2", 40, { gapBefore: 8 }),
      block("s2", "e2", 432, { gapBefore: 8, split }),
      block("f2", "e2", 72, { gapBefore: 8, split: familySplit }),
    ];
    // e2 总高 = 60+8+40+8+432+8+72 = 628
    const fitsAll = paginate(build(350), { columns: 1, columnHeight: 1000 }); // 剩余 650 ≥ 628 → 不移动
    expect(fitsAll.entryFirstPage["e2"]).toBe(0);
    const notFit = paginate(build(550), { columns: 1, columnHeight: 1000 }); // 剩余 450 < 628 → 移到第 2 页开头
    expect(notFit.entryFirstPage["e2"]).toBe(1);
    expect(notFit.pages[1].slots[0][0].id).toBe("h2");
  });

  it("连续模式：页面优先填满，题头允许落在页中", () => {
    const split = { header: 16, units: [{ from: 0, to: 1, h: 300 }] };
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 850),
      { id: "h2", entryId: "e2", kind: "header", height: 60, glueWithNext: true },
      block("p2", "e2", 40, { gapBefore: 8 }),
      block("s2", "e2", 316, { gapBefore: 8, split }),
    ];
    const aligned = paginate(blocks, { columns: 1, columnHeight: 1000, mode: "align" });
    const continuous = paginate(blocks, { columns: 1, columnHeight: 1000, mode: "continuous" });
    // 对齐模式：整段移到第 2 页
    expect(aligned.pages[0].slots[0].map((b) => b.id)).toEqual(["a"]);
    expect(aligned.entryFirstPage["e2"]).toBe(1);
    // 连续模式：题头+音标留在第 1 页（占满），内容块顺势到第 2 页
    expect(continuous.pages[0].slots[0].map((b) => b.id)).toEqual(["a", "h2", "p2"]);
    expect(continuous.entryFirstPage["e2"]).toBe(0);
  });

  it("整块优先：横向换行内容（标签）以真实整块高度判定，不被单元累加误导", () => {
    // 整块真实高 40（3 个标签同一行），单元累加模型为 121 —— 必须以 40 判定
    const tags = {
      header: 16,
      units: [
        { from: 0, to: 1, h: 35 },
        { from: 1, to: 2, h: 35 },
        { from: 2, to: 3, h: 35 },
      ],
    };
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 600),
      { id: "t", entryId: "e1", kind: "section", height: 40, split: tags, gapBefore: 8 },
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a", "t"]);
    expect(result.pages[0].slots[0][1].slice).toBeUndefined();
  });

  it("小字段整块保护：矮块绝不切分（修复 3 个标签被拆成 1+2）", () => {
    const tags = {
      header: 16,
      units: [
        { from: 0, to: 1, h: 35 },
        { from: 1, to: 2, h: 35 },
        { from: 2, to: 3, h: 35 },
      ],
    };
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 900),
      block("t", "e1", 121, { gapBefore: 8, split: tags }),
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    const placed = result.pages.flatMap((p) => p.slots).flat().find((b) => b.id === "t");
    expect(placed?.slice).toBeUndefined(); // 整块放置，未切分
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a"]);
    expect(result.pages[1].slots[0].map((b) => b.id)).toEqual(["t"]);
  });

  it("义项 cell 切片随单元传递到页面计划", () => {
    const cellsA = [{ from: 0, to: 1, part: "core" as const }];
    const cellsB = [{ from: 0, to: 1, part: "extras" as const }];
    const split = {
      header: 16,
      units: [
        { from: 0, to: 1, h: 120, cells: cellsA },
        { from: 0, to: 1, h: 180, cells: cellsB },
      ],
    };
    const blocks: MeasuredBlock[] = [
      { id: "h", entryId: "e1", kind: "header", height: 40, glueWithNext: true },
      { id: "s", entryId: "e1", kind: "section", height: 316, split, gapBefore: 8 },
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 200 });
    expect(result.pages[0].slots[0][1].cells).toEqual(cellsA);
    expect(result.pages[1].slots[0][0].cells).toEqual(cellsB);
  });

  it("去掉尾部空页", () => {
    const blocks = [block("a", "e1", 100)];
    const result = paginate(blocks, { columns: 3, columnHeight: 1000 });
    expect(result.pages).toHaveLength(1);
  });

  it("glueWithPrev（手账笔记带）：上一块放得下但装不下带子时，两块一起换列", () => {
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 700, { kind: "header", gapBefore: 0 }),
      block("s", "e1", 200, { gapBefore: 0 }),
      block("band", "e1", 150, { kind: "band", gapBefore: 0, glueWithPrev: true }),
      block("e2", "e2", 100, { kind: "header", gapBefore: 0 }),
    ];
    const result = paginate(blocks, { columns: 2, columnHeight: 1000 });
    // s 放完后只剩 100 < 150：s 与 band 一起移入第二列（而非 s 留在第一列、band 掉到第二列）
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a"]);
    expect(result.pages[0].slots[1].map((b) => b.id)).toEqual(["s", "band", "e2"]);
  });

  it("glueWithPrev 无论如何都放不下时优雅分离（不卡死、不溢出）", () => {
    const blocks: MeasuredBlock[] = [
      block("a", "e1", 900, { kind: "header" }),
      block("band", "e1", 300, { kind: "band", glueWithPrev: true }),
    ];
    const result = paginate(blocks, { columns: 1, columnHeight: 1000 });
    expect(result.pages[0].slots[0].map((b) => b.id)).toEqual(["a"]);
    expect(result.pages[1].slots[0].map((b) => b.id)).toEqual(["band"]);
  });
});

describe("paginateGrid", () => {
  it("按每页容量切块", () => {
    expect(paginateGrid([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginateGrid([], 4)).toEqual([]);
  });
});
