import { ymd } from "./types";

/**
 * 复习热力图数据（纯函数；时间与宽度由调用方注入，组件只负责渲染）
 * ------------------------------------------------------------------
 * - 显示周数按容器宽度自适应（13–26 周），把横向空间用满；
 * - 从今天所在的周开始向前铺，周一为每列起点；
 * - 月份标签只在该列是当月第一列、且与上一个标签至少隔 3 列时出现（防文字打架）。
 */

export interface HeatmapCell {
  date: string;
  count: number;
  /** 未来日期（本周末尾可能超出今天）——渲染时弱化 */
  future: boolean;
  today: boolean;
}

export interface HeatmapColumn {
  /** 月份标签（仅部分列有；null = 不显示） */
  label: string | null;
  cells: HeatmapCell[];
}

/** 13–26 周（约一个季度到半年；对应索引上限 180 天的日志保留期） */
export function heatmapWeeksForWidth(
  width: number,
  opts: { min?: number; max?: number; cell?: number; gap?: number } = {},
): number {
  const { min = 13, max = 26, cell = 13, gap = 4 } = opts;
  if (!Number.isFinite(width) || width <= 0) return min;
  const raw = Math.floor((width + gap) / (cell + gap));
  return Math.max(min, Math.min(max, raw));
}

/** 色阶：0 / 1-9 / 10-24 / 25-49 / 50+ */
export function heatmapLevel(n: number): 0 | 1 | 2 | 3 | 4 {
  return n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
}

export function buildHeatmapGrid(counts: Record<string, number>, endMs: number, weeks: number): HeatmapColumn[] {
  const end = new Date(endMs);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (weeks * 7 - 1));
  const startDay = (start.getDay() + 6) % 7; // 0 = 周一
  start.setDate(start.getDate() - startDay);
  const cursor = new Date(start);
  const endTime = end.getTime();
  const todayKey = ymd(endTime);
  const cols: HeatmapColumn[] = [];
  let lastMonth = -1;
  let lastLabelCol = -99;
  while (cursor.getTime() <= endTime) {
    let label: string | null = null;
    const month = cursor.getMonth();
    if (month !== lastMonth) {
      if (cols.length - lastLabelCol >= 3) {
        label = `${month + 1}月`;
        lastLabelCol = cols.length;
      }
      lastMonth = month;
    }
    const cells: HeatmapCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const t = cursor.getTime();
      const date = ymd(t);
      cells.push({ date, count: counts[date] ?? 0, future: t > endTime, today: date === todayKey });
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push({ label, cells });
  }
  return cols;
}
