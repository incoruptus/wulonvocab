import type { Entry, Wordbook } from "../types";
import { isDue, isNewSrs, retrievabilityOf } from "./engine";
import { isEntrySuspended } from "./leech";
import {
  dailyLogOf,
  newOrderSort,
  shuffleItems,
  studyConfigOf,
  studyStateOf,
  avoidSimilarNeighbors,
  type QueueItem,
} from "./queue";
import { sortEntries } from "./sort";

export type BatchDimension = "random" | "contextTags" | "source" | "frequency";
export type BatchIntent = "new" | "review" | "cram";

export interface BatchSelection {
  dimension: BatchDimension;
  key?: string;
  contextKey?: string;
  size?: number;
}

export interface BatchOption {
  value: string;
  label: string;
  count: number;
}

export interface BatchGroup {
  dimension: BatchDimension;
  label: string;
  contextKey?: string;
  options: BatchOption[];
}

const DIMENSION_LABELS: Record<BatchDimension, string> = {
  random: "随机",
  contextTags: "主题 / 情景",
  source: "来源",
  frequency: "频率",
};

export function clampBatchSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(10, Math.max(5, Math.round(value)))
    : 8;
}

export function batchSelectionFromParams(params: URLSearchParams): BatchSelection | null {
  const raw = params.get("batch");
  if (!raw) return null;
  if (raw !== "random" && raw !== "contextTags" && raw !== "source" && raw !== "frequency") return null;
  const size = Number(params.get("size"));
  return {
    dimension: raw,
    key: params.get("key")?.slice(0, 120) || undefined,
    contextKey: params.get("contextKey")?.slice(0, 120) || undefined,
    size: clampBatchSize(Number.isFinite(size) && size > 0 ? size : undefined),
  };
}

function contextFields(book: Wordbook) {
  return book.schema.sections.filter((section) => section.type === "tags");
}

function tagsOf(entry: Entry, key: string): string[] {
  const value = entry.values[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

/** 动态字段下不硬编码「考频」key；按字段名与规范值读取数字。 */
export function frequencyOf(entry: Entry, book: Wordbook): number | null {
  for (const section of book.schema.sections) {
    if (!/^(考频|频率|frequency|freq)$/i.test(section.label.trim()) && !/^(frequency|freq)$/i.test(section.key)) continue;
    const raw = entry.values[section.key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Array.isArray(raw) ? Number(raw[0]) : NaN;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function batchGroups(book: Wordbook): BatchGroup[] {
  const groups: BatchGroup[] = [{
    dimension: "random",
    label: DIMENSION_LABELS.random,
    options: [{ value: "", label: "随机 8 个词", count: book.entries.length }],
  }];
  for (const field of contextFields(book)) {
    const counts = new Map<string, number>();
    for (const entry of book.entries) for (const tag of tagsOf(entry, field.key)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    if (counts.size) {
      groups.push({
        dimension: "contextTags",
        label: field.label,
        contextKey: field.key,
        options: [...counts].sort((a, b) => a[0].localeCompare(b[0], "zh-CN")).map(([value, count]) => ({ value, label: value, count })),
      });
    }
  }
  const sources = new Map<string, { label: string; count: number }>();
  for (const entry of book.entries) {
    const source = entry.source ?? { kind: "manual" as const, at: 0 };
    const key = source.kind;
    const current = sources.get(key) ?? { label: source.label || key, count: 0 };
    current.count += 1;
    sources.set(key, current);
  }
  if (sources.size) {
    groups.push({
      dimension: "source",
      label: DIMENSION_LABELS.source,
      options: [...sources].map(([value, item]) => ({ value, label: item.label, count: item.count })),
    });
  }
  const frequencies = new Map<string, number>();
  for (const entry of book.entries) {
    const value = frequencyOf(entry, book);
    if (value !== null) frequencies.set(String(value), (frequencies.get(String(value)) ?? 0) + 1);
  }
  if (frequencies.size) {
    groups.push({
      dimension: "frequency",
      label: DIMENSION_LABELS.frequency,
      options: [...frequencies].sort((a, b) => Number(b[0]) - Number(a[0])).map(([value, count]) => ({ value, label: `频次 ${value}`, count })),
    });
  }
  return groups;
}

function matchesBatch(entry: Entry, book: Wordbook, selection: BatchSelection): boolean {
  if (selection.dimension === "random") return true;
  if (!selection.key) return false;
  const key = selection.key;
  if (selection.dimension === "contextTags") {
    const contextKey = selection.contextKey;
    if (!contextKey) return false;
    return tagsOf(entry, contextKey).includes(key);
  }
  if (selection.dimension === "source") return (entry.source?.kind ?? "manual") === key;
  return frequencyOf(entry, book) !== null && String(frequencyOf(entry, book)) === key;
}

export function batchLabel(book: Wordbook, selection: BatchSelection): string {
  const group = batchGroups(book).find((item) =>
    item.dimension === selection.dimension &&
    (selection.dimension !== "contextTags" || item.contextKey === selection.contextKey),
  );
  if (selection.dimension === "random") return "随机学习批次";
  const option = group?.options.find((item) => item.value === selection.key);
  return option ? `${group?.label ?? DIMENSION_LABELS[selection.dimension]} · ${option.label}` : DIMENSION_LABELS[selection.dimension];
}

/**
 * 学习批次与浏览分区分离：只允许随机、主题 / 情景、来源、频率。
 * 新词按配置排序后切成 5–10 词；复习按 R 升序；cram 每词一次且不写 SRS。
 */
export function buildBatchQueue(
  book: Wordbook,
  selection: BatchSelection,
  intent: BatchIntent,
  now = Date.now(),
  opts: { allowSimilar?: boolean; rng?: () => number; seed?: number } = {},
): QueueItem[] {
  if (intent !== "cram" && studyStateOf(book) !== "active") return [];
  const cfg = studyConfigOf(book);
  const size = clampBatchSize(selection.size);
  const rng = opts.rng ?? Math.random;
  let candidates = book.entries.filter((entry) => !isEntrySuspended(entry, now) && matchesBatch(entry, book, selection));
  if (intent === "new") candidates = candidates.filter((entry) => isNewSrs(entry.srs));
  if (intent === "review") candidates = candidates.filter((entry) => isDue(entry.srs, now));

  let items: QueueItem[];
  if (intent === "new") {
    const daily = dailyLogOf(book, now);
    const remaining = Math.max(0, cfg.newPerDay - daily.added);
    const { dim, dir } = newOrderSort(cfg.newOrder);
    items = sortEntries(candidates, dim, dir, { now, rng }).slice(0, Math.min(size, remaining)).map((entry) => ({ entryId: entry.id, isNew: true, newWord: true }));
  } else if (intent === "review") {
    const daily = dailyLogOf(book, now);
    const remaining = Math.max(0, cfg.reviewPerDay - daily.reviewed);
    candidates = [...candidates].sort((a, b) =>
      retrievabilityOf(a.srs, now, cfg.retention) - retrievabilityOf(b.srs, now, cfg.retention) || (a.srs?.due ?? 0) - (b.srs?.due ?? 0),
    );
    items = candidates.slice(0, Math.min(size, remaining)).map((entry) => ({ entryId: entry.id, isNew: false }));
  } else {
    items = shuffleItems(candidates.map((entry) => ({ entryId: entry.id, isNew: isNewSrs(entry.srs) })), rng).slice(0, size);
  }

  if (cfg.similarityAvoid && !opts.allowSimilar && items.length > 1) {
    items = avoidSimilarNeighbors(book.entries, items);
  }
  return items;
}
