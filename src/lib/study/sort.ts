import type { Entry } from "../types";
import type { StudySrs } from "./types";

export type SortDim = "list" | "az" | "created" | "updated" | "due" | "stability" | "lapses" | "shuffle";
export type SortDir = "asc" | "desc";

export const SORT_DIM_OPTIONS: { value: SortDim; label: string }[] = [
  { value: "list", label: "词库顺序" },
  { value: "az", label: "字母序" },
  { value: "created", label: "最近添加" },
  { value: "updated", label: "最近编辑" },
  { value: "due", label: "到期时间" },
  { value: "stability", label: "记忆强度" },
  { value: "lapses", label: "遗忘次数" },
  { value: "shuffle", label: "乱序" },
];

export const S_BUCKETS = [
  { key: "lt1", label: "不足 1 天", test: (s: number) => s < 1 },
  { key: "1to7", label: "1 至 7 天", test: (s: number) => s >= 1 && s < 7 },
  { key: "7to30", label: "7 至 30 天", test: (s: number) => s >= 7 && s < 30 },
  { key: "30to180", label: "30 至 180 天", test: (s: number) => s >= 30 && s < 180 },
  { key: "gte180", label: "180 天以上", test: (s: number) => s >= 180 },
] as const;

export type StabilityBucket = (typeof S_BUCKETS)[number]["key"];

export function sBucketOf(srs: StudySrs | undefined): StabilityBucket {
  const stability = Math.max(0, srs?.stability ?? 0);
  return S_BUCKETS.find((bucket) => bucket.test(stability))?.key ?? "lt1";
}

/** 首字母分组：大小写与重音归一化；非英文字母归入 #。 */
export function initialOf(headword: string): string {
  const first = headword.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "")[0] ?? "";
  return /^[a-z]$/i.test(first) ? first.toUpperCase() : "#";
}

/** 可复现的轻量 PRNG；只存 seed，不存打乱结果。 */
export function rngFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}

/**
 * 列表排序（纯函数）。list 表示传入数组的顺序；其它维度按值排序，乱序可注入 seed/rng。
 * 不修改输入数组；同值时保留原顺序，避免每次渲染跳动。
 */
export function sortEntries(
  entries: Entry[],
  dim: SortDim,
  dir: SortDir = "asc",
  opts: { now?: number; seed?: number; rng?: () => number } = {},
): Entry[] {
  if (dim === "shuffle") {
    const out = [...entries];
    const rng = opts.rng ?? (opts.seed === undefined ? Math.random : rngFromSeed(opts.seed));
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const indexed = entries.map((entry, index) => ({ entry, index }));
  const direction = dir === "asc" ? 1 : -1;
  indexed.sort((a, b) => {
    let cmp = 0;
    switch (dim) {
      case "list":
        cmp = a.index - b.index;
        break;
      case "az":
        cmp = compareText(a.entry.headword, b.entry.headword);
        break;
      case "created":
        cmp = a.entry.createdAt - b.entry.createdAt;
        break;
      case "updated":
        cmp = a.entry.updatedAt - b.entry.updatedAt;
        break;
      case "due":
        cmp = (a.entry.srs?.due ?? 0) - (b.entry.srs?.due ?? 0);
        break;
      case "stability":
        cmp = (a.entry.srs?.stability ?? 0) - (b.entry.srs?.stability ?? 0);
        break;
      case "lapses":
        cmp = (a.entry.srs?.lapses ?? 0) - (b.entry.srs?.lapses ?? 0);
        break;
    }
    return cmp * direction;
  });
  return indexed.map(({ entry }) => entry);
}
