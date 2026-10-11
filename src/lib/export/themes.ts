import type { CSSProperties } from "react";
import type { CardStyle, ExportSettings, GridSettings } from "../types";

/**
 * 导出主题 = **结构预设**（依据 docs/research/themes-2026-10.md）
 * ------------------------------------------------------------
 * 主题决定骨架与排版默认值（字体/字号/行距/间距/分页模式/网格），而不是换色；
 * 切换主题时可一并应用这些默认值，用户之后仍可逐项微调。
 * 旧值迁移：classic→dictionary、minimal→swiss、compact→dictionary（退役）、notebook→notebook。
 */

export interface ThemeDef {
  id: CardStyle;
  name: string;
  signature: string;
  defaults: Partial<
    Omit<
      ExportSettings,
      "grid" | "cover" | "index" | "footer" | "sectionVisibility" | "customPaper" | "margin" | "accent" | "sortMode" | "headwordCase" | "paper" | "orientation"
    >
  > & { grid?: Partial<GridSettings> };
}

export const CARD_STYLES: CardStyle[] = ["dictionary", "swiss", "notebook", "flashcard"];

export const EXPORT_THEMES: ThemeDef[] = [
  {
    id: "dictionary",
    name: "辞书体",
    signature: "悬挂缩进 · 密排 · 细线",
    defaults: {
      fontFamily: "serif",
      fontScale: 0.95,
      lineHeight: 1.45,
      entryGap: 4,
      paginationMode: "align",
      showSectionLabels: true,
      layout: "flow",
      writingLines: 0,
    },
  },
  {
    id: "swiss",
    name: "瑞士极简",
    signature: "网格 · 无标签 · 留白",
    defaults: {
      fontFamily: "sans",
      fontScale: 1,
      lineHeight: 1.8,
      entryGap: 10,
      paginationMode: "continuous",
      showSectionLabels: false,
      layout: "flow",
      writingLines: 0,
    },
  },
  {
    id: "notebook",
    name: "笔记手账",
    signature: "横线纸 · 书写线 · 胶带标",
    defaults: {
      tone: "cream",
      fontFamily: "sans",
      fontScale: 1,
      lineHeight: 1.7,
      entryGap: 8,
      paginationMode: "align",
      showSectionLabels: true,
      layout: "flow",
      writingLines: 3,
    },
  },
  {
    id: "flashcard",
    name: "闪卡",
    signature: "独立卡框 · 剪裁线 · 大留白",
    defaults: {
      layout: "grid",
      fontScale: 1.1,
      lineHeight: 1.55,
      paginationMode: "align",
      showSectionLabels: false,
      grid: { columns: 2, rows: 3, showBorder: true, flashcard: true, gapMm: 10 },
    },
  },
];

export function themeById(id: CardStyle): ThemeDef {
  return EXPORT_THEMES.find((t) => t.id === id) ?? EXPORT_THEMES[0];
}

export function normalizeCardStyle(v: unknown): CardStyle {
  switch (v) {
    case "classic":
      return "dictionary";
    case "minimal":
      return "swiss";
    case "compact":
      return "dictionary"; // 退役：归入辞书体（可再手动调密排）
    case "dictionary":
    case "swiss":
    case "notebook":
    case "flashcard":
      return v;
    default:
      return "dictionary";
  }
}

/** 迁移：旧 cardStyle 值 + 补齐新增字段（grid.gapMm）。任何渲染/测量入口前调用。 */
export function normalizeExportSettings(s: ExportSettings): ExportSettings {
  const cardStyle = normalizeCardStyle(s.cardStyle);
  const gapMm = typeof s.grid?.gapMm === "number" ? s.grid.gapMm : 4;
  if (cardStyle === s.cardStyle && s.grid?.gapMm === gapMm) return s;
  return { ...s, cardStyle, grid: { ...s.grid, gapMm } };
}

export function applyTheme(s: ExportSettings, id: CardStyle): ExportSettings {
  const base = normalizeExportSettings(s);
  const { grid: gridPatch, ...rest } = themeById(id).defaults;
  return { ...base, ...rest, cardStyle: id, grid: { ...base.grid, ...(gridPatch ?? {}) } };
}

/** 主题相关 CSS 变量（文档根与测量层同源下发，保证测量与渲染一致） */
export function themeCssVars(style: CardStyle): CSSProperties {
  return style === "notebook" ? { ["--wv-write-pitch" as string]: "1.7em" } : {};
}

/** 主题根类名：瑞士主题在卡片根挂 `wv-swiss`，卡片内一切 chips 降为纯文本（globals.css 配套） */
export function themeRootClass(style: CardStyle): string {
  return style === "swiss" ? "wv-swiss" : "";
}

/**
 * 实际栏数：辞书体 + 流式 + 当前 1 栏 + 内容宽 ≥165mm → 自动 2 栏
 * （测量与渲染同源：useExportDocument 用本函数决定 geometry，PrintDocument 按计划槽渲染）
 */
export function effectiveColumns(
  cardStyle: ExportSettings["cardStyle"],
  layout: ExportSettings["layout"],
  columns: number,
  contentWidthMm: number,
): number {
  if (cardStyle !== "dictionary" || layout !== "flow") return columns;
  if (columns !== 1) return columns;
  return contentWidthMm >= 165 ? 2 : 1;
}
