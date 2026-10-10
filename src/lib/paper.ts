import type { MarginSetting, Orientation, PaperId, PaperSize, PaperTone, AccentId } from "./types";

/** 毫米 -> CSS 像素（96dpi 标准） */
export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_INCH = 96;

export function mmToPx(mm: number): number {
  return (mm * CSS_PX_PER_INCH) / MM_PER_INCH;
}

export function pxToMm(px: number): number {
  return (px * MM_PER_INCH) / CSS_PX_PER_INCH;
}

/**
 * 常用印刷与出版尺寸（中国图书常见「开数」一并内置）。
 * 尺寸数据来源：ISO 216（A 系列）、ISO 216 B 系列、GB/T 788（16 开 / 32 开）。
 */
export const PAPERS: PaperSize[] = [
  { id: "A4", name: "A4", width: 210, height: 297, note: "国际标准 · 打印装订最通用" },
  { id: "A5", name: "A5", width: 148, height: 210, note: "A4 对折 · 手账/随身本常用" },
  { id: "B5iso", name: "B5 (ISO)", width: 176, height: 250, note: "国际 B5 · 教材常用" },
  { id: "B5jis", name: "B5 (JIS)", width: 182, height: 257, note: "日本 B5（JIS）" },
  { id: "16K", name: "16 开", width: 185, height: 260, note: "中国图书 16 开（正度）" },
  { id: "32K", name: "32 开", width: 130, height: 184, note: "中国图书 32 开 · 口袋本" },
  { id: "custom", name: "自定义", width: 200, height: 260, note: "自由输入尺寸" },
];

export function getPaperById(id: PaperId): PaperSize {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

export interface PageBox {
  width: number;
  height: number;
}

/** 返回纵向尺寸（不区分方向） */
export function getPaperBox(
  paper: PaperId,
  custom?: { width: number; height: number },
): PageBox {
  if (paper === "custom" && custom) {
    return { width: custom.width, height: custom.height };
  }
  const p = getPaperById(paper);
  return { width: p.width, height: p.height };
}

export function applyOrientation(box: PageBox, orientation: Orientation): PageBox {
  if (orientation === "landscape") {
    return { width: Math.max(box.width, box.height), height: Math.min(box.width, box.height) };
  }
  return { width: Math.min(box.width, box.height), height: Math.max(box.width, box.height) };
}

export interface PageGeometry {
  /** 页面尺寸（mm） */
  page: PageBox;
  /** 内容区尺寸（mm），已扣除页边距与装订留白 */
  content: PageBox;
  /** 每页列内容宽（mm，流式分栏） */
  columnWidth: number;
}

/** 计算页面几何：content 为扣除边距后的可用区域 */
export function computeGeometry(
  paper: PageIdOrBox,
  orientation: Orientation,
  margin: MarginSetting,
  columns: number,
  columnGapMm: number,
): PageGeometry {
  const base =
    typeof paper === "string" ? getPaperBox(paper) : paper;
  const page = applyOrientation(base, orientation);
  const contentW = Math.max(20, page.width - margin.left - margin.right);
  const contentH = Math.max(20, page.height - margin.top - margin.bottom);
  const colW = Math.max(
    10,
    (contentW - columnGapMm * (columns - 1)) / columns,
  );
  return {
    page,
    content: { width: contentW, height: contentH },
    columnWidth: colW,
  };
}

type PageIdOrBox = PaperId | PageBox;

/** 指定页的区域：flow 模式下按列裁剪，grid 模式整块 */
export function getAreaBox(geom: PageGeometry, mode: "flow" | "grid"): PageBox {
  return mode === "flow" ? { width: geom.columnWidth, height: geom.content.height } : geom.content;
}

/**
 * 页边距预设（mm）。gutter 为装订侧额外留白。
 */
export interface MarginPreset {
  id: string;
  name: string;
  margin: MarginSetting;
  hint: string;
}

export const MARGIN_PRESETS: MarginPreset[] = [
  {
    id: "comfortable",
    name: "舒适阅读",
    margin: { top: 16, right: 15, bottom: 16, left: 15, gutter: 0, mirror: false },
    hint: "留白充足，阅读轻松（推荐 A5/B5）",
  },
  {
    id: "standard",
    name: "标准",
    margin: { top: 14, right: 13, bottom: 14, left: 13, gutter: 0, mirror: false },
    hint: "均衡的版面密度",
  },
  {
    id: "compact",
    name: "省纸紧凑",
    margin: { top: 10, right: 9, bottom: 10, left: 9, gutter: 0, mirror: false },
    hint: "内容最大化，适合双面打印",
  },
  {
    id: "bound",
    name: "装订友好",
    margin: { top: 15, right: 12, bottom: 15, left: 12, gutter: 5, mirror: true },
    hint: "内侧额外留 5mm，双面镜像，胶装/铁圈装订不压字",
  },
  {
    id: "saddle",
    name: "骑马钉",
    margin: { top: 14, right: 12, bottom: 14, left: 12, gutter: 3, mirror: true },
    hint: "折页中缝留白，适合小册子",
  },
];

export const TONES: Record<PaperTone, { id: PaperTone; name: string; bg: string; fg: string; line: string; soft: string; hint: string }> = {
  white: { id: "white", name: "纯白", bg: "#ffffff", fg: "#111111", line: "#e6e6e6", soft: "#4b4b4b", hint: "标准打印纸" },
  cream: { id: "cream", name: "米黄护眼", bg: "#fbf5e9", fg: "#2b2416", line: "#e9dfc8", soft: "#6b5e45", hint: "减缓视觉疲劳（需开背景图形打印）" },
  gray: { id: "gray", name: "浅灰", bg: "#f6f6f5", fg: "#141414", line: "#e3e3e2", soft: "#4d4d4d", hint: "低对比柔和版面" },
};

export const ACCENTS: Record<AccentId, { id: AccentId; name: string; hex: string }> = {
  blue: { id: "blue", name: "Geist 蓝", hex: "#0068d6" },
  violet: { id: "violet", name: "紫罗兰", hex: "#7c3aed" },
  teal: { id: "teal", name: "青碧", hex: "#0d9488" },
  amber: { id: "amber", name: "琥珀", hex: "#b45309" },
  rose: { id: "rose", name: "玫瑰", hex: "#be185d" },
  green: { id: "green", name: "松绿", hex: "#15803d" },
  gray: { id: "gray", name: "石墨", hex: "#52525b" },
};

export function accentHex(id: AccentId): string {
  return (ACCENTS[id] ?? ACCENTS.blue).hex;
}

/** 打印字体栈：西文 Geist / 中文回退到系统字体；serif 模式中文用宋体系 */
export const FONT_STACKS = {
  sans: '"Geist", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", system-ui, -apple-system, sans-serif',
  serif:
    'Georgia, "Times New Roman", "Songti SC", SimSun, "Noto Serif SC", "Source Han Serif SC", serif',
} as const;

/** 估算打印 DPI（pagePx 为导出像素宽，pageMm 为纸张宽度 mm） */
export function estimateDpi(pagePx: number, pageMm: number): number {
  const inch = pageMm / MM_PER_INCH;
  return Math.round(pagePx / inch);
}

/** 给定目标 DPI 计算所需 pixelRatio */
export function pixelRatioForDpi(targetDpi: number, pageMm: number, cssWidthPx: number): number {
  const targetPx = (targetDpi * pageMm) / MM_PER_INCH;
  return Math.max(1, Math.round((targetPx / cssWidthPx) * 100) / 100);
}
