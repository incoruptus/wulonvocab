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

  it("去掉尾部空页", () => {
    const blocks = [block("a", "e1", 100)];
    const result = paginate(blocks, { columns: 3, columnHeight: 1000 });
    expect(result.pages).toHaveLength(1);
  });
});

describe("paginateGrid", () => {
  it("按每页容量切块", () => {
    expect(paginateGrid([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginateGrid([], 4)).toEqual([]);
  });
});
