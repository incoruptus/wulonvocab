import type { Entry, SectionDef, Wordbook } from "../types";
import { initialOf, sBucketOf, S_BUCKETS } from "./sort";

export type GroupDim = "none" | "tags" | "contextTags" | "initial" | "status" | "sBucket" | "source";
export type TagMembership = "first" | "all";

export const GROUP_DIM_OPTIONS: { value: GroupDim; label: string }[] = [
  { value: "none", label: "不分组" },
  { value: "tags", label: "词条标签" },
  { value: "contextTags", label: "情景标签" },
  { value: "initial", label: "首字母" },
  { value: "status", label: "学习状态" },
  { value: "sBucket", label: "记忆强度" },
  { value: "source", label: "来源" },
];

export interface EntryGroup {
  key: string;
  label: string;
  entries: Entry[];
}

const STATUS_LABELS: Record<Entry["status"], string> = {
  new: "未学",
  learning: "在学",
  mastered: "已掌握",
};

const SOURCE_LABELS: Record<NonNullable<Entry["source"]>["kind"], string> = {
  manual: "手动添加",
  import: "导入",
  lookup: "词典检索",
  ai: "AI 生成",
};

/** 动态 schema 中的所有标签字段；不硬编码 contexts，兼容用户重命名。 */
export function contextTagFields(book: Wordbook): SectionDef[] {
  return [...book.schema.sections].filter((section) => section.type === "tags").sort((a, b) => a.order - b.order);
}

function valuesOf(entry: Entry, field: SectionDef | undefined): string[] {
  if (!field) return [];
  const raw = entry.values[field.key];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => String(value).trim()).filter(Boolean))];
}

function stableGroupKey(label: string): string {
  return label.toLocaleLowerCase("en");
}

/**
 * 分区（纯函数）。多标签可只归入首个标签，或同时出现在多个分区。
 * 分区不复制词条，只建立引用；区内顺序沿用调用方传入的排序结果。
 */
export function groupEntries(
  entries: Entry[],
  book: Wordbook,
  dim: GroupDim,
  opts: { tagMode?: TagMembership; contextKey?: string; showEmptyGroups?: boolean } = {},
): EntryGroup[] {
  if (dim === "none") return entries.length ? [{ key: "all", label: "全部", entries }] : [];

  const groups = new Map<string, EntryGroup>();
  const add = (key: string, label: string, entry: Entry) => {
    const existing = groups.get(key);
    if (existing) existing.entries.push(entry);
    else groups.set(key, { key, label, entries: [entry] });
  };
  const addUnlabeled = (entry: Entry) => add("__unlabeled__", "未标记", entry);
  const contextFields = contextTagFields(book);
  const contextField = contextFields.find((field) => field.key === opts.contextKey) ?? contextFields[0];

  for (const entry of entries) {
    if (dim === "tags") {
      const tags = entry.tags;
      if (!tags.length) addUnlabeled(entry);
      else if (opts.tagMode === "all") for (const tag of tags) add(`tag:${stableGroupKey(tag)}`, tag, entry);
      else add(`tag:${stableGroupKey(tags[0])}`, tags[0], entry);
      continue;
    }
    if (dim === "contextTags") {
      const tags = valuesOf(entry, contextField);
      if (!tags.length) addUnlabeled(entry);
      else if (opts.tagMode === "all") for (const tag of tags) add(`context:${stableGroupKey(tag)}`, tag, entry);
      else add(`context:${stableGroupKey(tags[0])}`, tags[0], entry);
      continue;
    }
    if (dim === "initial") {
      const initial = initialOf(entry.headword);
      add(`initial:${initial}`, initial, entry);
      continue;
    }
    if (dim === "status") {
      add(`status:${entry.status}`, STATUS_LABELS[entry.status], entry);
      continue;
    }
    if (dim === "sBucket") {
      const bucket = sBucketOf(entry.srs);
      add(`sBucket:${bucket}`, S_BUCKETS.find((item) => item.key === bucket)?.label ?? "不足 1 天", entry);
      continue;
    }
    if (dim === "source") {
      const kind = entry.source?.kind;
      add(kind ? `source:${kind}` : "source:none", kind ? SOURCE_LABELS[kind] : "未注明", entry);
    }
  }

  if (opts.showEmptyGroups) {
    const ensure = (key: string, label: string) => {
      if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
    };
    if (dim === "initial") for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ#") ensure(`initial:${letter}`, letter);
    if (dim === "status") for (const [key, label] of Object.entries(STATUS_LABELS)) ensure(`status:${key}`, label);
    if (dim === "sBucket") for (const bucket of S_BUCKETS) ensure(`sBucket:${bucket.key}`, bucket.label);
    if (dim === "source") {
      for (const [key, label] of Object.entries(SOURCE_LABELS)) ensure(`source:${key}`, label);
      ensure("source:none", "未注明");
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "__unlabeled__") return 1;
    if (b.key === "__unlabeled__") return -1;
    return a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true });
  });
}
