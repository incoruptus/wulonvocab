import { describe, expect, it } from "vitest";
import type { Entry } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { avoidSimilarNeighbors, buildQueue, requeueInsertIndex, wordsSimilar } from "./queue";
import type { StudySrs } from "./types";

function srs(due: number): StudySrs {
  return { due, stability: 1, difficulty: 5, elapsedDays: 1, scheduledDays: 1, reps: 2, lapses: 0, state: 2, learningSteps: 0 };
}

function mk(id: string, word: string, zh: string): Entry {
  return makeEntry({
    id,
    headword: word,
    srs: srs(id.charCodeAt(0) - 97),
    values: {
      senses: [
        {
          id: `s-${id}`,
          pos: "n.",
          translation: zh,
          definition: "",
          examples: [],
          usage: "",
          patterns: [],
          synonyms: [],
          antonyms: [],
          collocations: [],
          notes: "",
        },
      ],
    },
  });
}

const itemsOf = (entries: Entry[]) => entries.map((e) => ({ entryId: e.id, isNew: false }));

describe("wordsSimilar", () => {
  it("词形相近（编辑距离）与义项高重叠都算相似；无关词不算", () => {
    expect(wordsSimilar(mk("a", "abandon", "抛弃"), mk("b", "abandoned", "被遗弃的"))).toBe(true);
    expect(wordsSimilar(mk("a", "abandon", "抛弃；遗弃"), mk("b", "discard", "遗弃；抛弃"))).toBe(true);
    expect(wordsSimilar(mk("a", "abandon", "抛弃"), mk("b", "tunnel", "隧道"))).toBe(false);
  });
});

describe("avoidSimilarNeighbors（软约束）", () => {
  it("相似词被拉开到至少 4 个索引间隔；不丢项", () => {
    const entries = [
      mk("a", "abandon", "抛弃"),
      mk("b", "abandoned", "被遗弃的"),
      mk("c", "calendar", "日历"),
      mk("d", "harvest", "收获"),
      mk("e", "tunnel", "隧道"),
      mk("f", "orbit", "轨道"),
    ];
    const out = avoidSimilarNeighbors(entries, itemsOf(entries));
    expect(out).toHaveLength(6);
    const idxA = out.findIndex((x) => x.entryId === "a");
    const idxB = out.findIndex((x) => x.entryId === "b");
    expect(Math.abs(idxA - idxB)).toBeGreaterThanOrEqual(4);
  });

  it("全部相似时保持原序（绝不阻塞/丢项）", () => {
    const entries = [mk("a", "abandon", "抛弃"), mk("b", "abandoned", "抛弃"), mk("c", "abandons", "抛弃")];
    const out = avoidSimilarNeighbors(entries, itemsOf(entries));
    expect(out.map((x) => x.entryId)).toEqual(["a", "b", "c"]);
  });
});

describe("buildQueue 集成与 requeueInsertIndex", () => {
  it("默认避让生效；本场允许相似词时保持原序", () => {
    const book = { ...createEmptyBook("避让"), id: "bk1", entries: [mk("a", "abandon", "抛弃"), mk("b", "abandoned", "被遗弃的"), mk("c", "calendar", "日历"), mk("d", "harvest", "收获"), mk("e", "tunnel", "隧道"), mk("f", "orbit", "轨道")] };
    const now = 1000;
    const q = buildQueue(book, "review", now);
    const idxA = q.findIndex((x) => x.entryId === "a");
    const idxB = q.findIndex((x) => x.entryId === "b");
    expect(Math.abs(idxA - idxB)).toBeGreaterThanOrEqual(4);

    const raw = buildQueue(book, "review", now, { allowSimilar: true });
    expect(raw.map((x) => x.entryId)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("回炉插入位置避开相似邻居，做不到时退回默认位", () => {
    const target = mk("a", "abandon", "抛弃");
    const twin = mk("b", "abandoned", "被遗弃的");
    const others = [
      mk("c1", "calendar", "日历"),
      mk("c2", "harvest", "收获"),
      mk("c3", "tunnel", "隧道"),
      mk("c4", "orbit", "轨道"),
    ];
    const entries = [target, twin, ...others];
    // 队列顺序：[c1, b, c2, c3, c4] —— 回炉点需避开 b 且与前后 3 格都不相似
    const rest = [{ entryId: "c1", isNew: false }, { entryId: "b", isNew: false }, { entryId: "c2", isNew: false }, { entryId: "c3", isNew: false }, { entryId: "c4", isNew: false }];
    const idx = requeueInsertIndex(entries, rest, "a");
    expect(idx).toBe(5); // 插到末尾（4 是默认位，仍会与 b 相邻于窗口）
    const window = rest.slice(Math.max(0, idx - 3), idx).map((x) => x.entryId);
    expect(window).not.toContain("b");

    const allSimilar = [mk("a", "abandon", "抛弃"), mk("b", "abandoned", "抛弃"), mk("c", "abandons", "抛弃")];
    const rest2 = itemsOf(allSimilar.filter((e) => e.id !== "a"));
    expect(requeueInsertIndex(allSimilar, rest2, "a")).toBe(Math.min(rest2.length, 4));
  });
});
