import type { SectionDef, SectionType } from "../types";

/**
 * 检索结果的字段级差异（B4 · 应用前逐字段对比勾选）
 * ------------------------------------------------------------
 * - buildValueDiff：对比「当前值 vs 归一化后的新值」，产出可勾选行（新增 / 覆盖两类）；
 * - summarizeValue：把任意字段值压成一行中文摘要（供差异面板展示，纯函数可单测）。
 */

export interface ValueDiffRow {
  key: string;
  label: string;
  type: SectionType;
  /** new = 当前为空（默认勾选）；conflict = 已有内容（默认不勾，勾选即覆盖） */
  kind: "new" | "conflict";
  current: unknown;
  incoming: unknown;
}

function clip(s: string, n = 64): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function summarizeValue(type: SectionType, value: unknown): string {
  if (value == null || value === "") return "（空）";
  switch (type) {
    case "text":
      return clip(String(value));
    case "quote":
      return clip(String((value as { text?: string })?.text ?? value));
    case "tags":
    case "list":
      if (!Array.isArray(value) || value.length === 0) return "（空）";
      return clip((value as string[]).join("，"));
    case "senses": {
      const senses = value as { pos?: string; translation?: string }[];
      if (!Array.isArray(senses) || !senses.length) return "（空）";
      return clip(senses.map((s) => `${s.pos ?? ""}${s.translation ?? ""}`).join("；"));
    }
    case "examples": {
      const items = value as { en?: string }[];
      if (!Array.isArray(items) || !items.length) return "（空）";
      return clip(items.map((e) => e.en ?? "").filter(Boolean).join(" / "));
    }
    case "keyvalue": {
      const items = value as { key?: string; value?: string }[];
      if (!Array.isArray(items) || !items.length) return "（空）";
      return clip(items.map((kv) => `${kv.key ?? ""}：${kv.value ?? ""}`).join("；"));
    }
    case "transforms": {
      const items = value as { label?: string; value?: string }[];
      if (!Array.isArray(items) || !items.length) return "（空）";
      return clip(items.map((t) => `${t.label ?? ""} ${t.value ?? ""}`).join("；"));
    }
    case "table": {
      const t = value as { columns?: string[]; rows?: string[][] };
      return `${t.rows?.length ?? 0} 行 × ${t.columns?.length ?? 0} 列`;
    }
    case "image": {
      const items = value as { caption?: string }[];
      return `${Array.isArray(items) ? items.length : 0} 张图片`;
    }
    case "rating": {
      const r = value as { value?: number; max?: number };
      return `${r.value ?? 0} / ${r.max ?? 5}`;
    }
    case "pronunciation": {
      const p = value as { uk?: string; us?: string };
      return clip([p.uk && `英 ${p.uk}`, p.us && `美 ${p.us}`].filter(Boolean).join("　"));
    }
    case "divider":
      return "（分隔线）";
    default:
      return clip(JSON.stringify(value));
  }
}

/** 对比当前值与新值（均为按键组织的对象），按 schema 顺序输出差异行；空值视作「新增」 */
export function buildValueDiff(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  sections: SectionDef[],
): ValueDiffRow[] {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const rows: ValueDiffRow[] = [];
  const order = (key: string) => byKey.get(key)?.order ?? 9999;
  const keys = Object.keys(incoming).sort((a, b) => order(a) - order(b));
  for (const key of keys) {
    const next = incoming[key];
    if (next == null || next === "") continue;
    const prev = current[key];
    const sec = byKey.get(key);
    if (!sec) continue;
    const empty = prev == null || prev === "" || (Array.isArray(prev) && prev.length === 0);
    if (!empty && JSON.stringify(prev) === JSON.stringify(next)) continue; // 值相同不必展示
    rows.push({
      key,
      label: sec.label,
      type: sec.type,
      kind: empty ? "new" : "conflict",
      current: prev,
      incoming: next,
    });
  }
  return rows;
}
