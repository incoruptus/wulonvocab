"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/utils";
import { ymd } from "@/lib/study/types";

interface Cell {
  date: string;
  count: number;
}

/**
 * 复习热力图：最近 13 周 × 7 天（本地日历）
 * 输入 { "YYYY-MM-DD": 复习次数 }；网格在挂载后计算（避免渲染期读取时间）。
 */
export function Heatmap({ counts, weeks = 13 }: { counts: Record<string, number>; weeks?: number }) {
  const [grid, setGrid] = useState<Cell[][]>([]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const days = weeks * 7;
      const end = new Date(Date.now());
      end.setHours(12, 0, 0, 0);
      const cols: Cell[][] = [];
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1));
      const startDay = (start.getDay() + 6) % 7; // 0=周一
      start.setDate(start.getDate() - startDay);
      const cursor = new Date(start);
      while (cursor <= end) {
        const col: Cell[] = [];
        for (let d = 0; d < 7; d += 1) {
          const key = ymd(cursor.getTime());
          col.push({ date: key, count: counts[key] ?? 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
        cols.push(col);
      }
      setGrid(cols);
    });
    return () => cancelAnimationFrame(raf);
  }, [counts, weeks]);

  const level = (n: number) => (n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4);
  const LEVEL_CLASS = [
    "bg-gray-100",
    "bg-blue-200",
    "bg-blue-400",
    "bg-blue-600",
    "bg-blue-800",
  ];

  return (
    <div className="overflow-x-auto scroll-thin">
      <div className="flex gap-[3px]">
        {grid.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date} · ${cell.count} 次复习`}
                className={cx("size-3 rounded-[3px]", LEVEL_CLASS[level(cell.count)])}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-700">
        <span>少</span>
        {LEVEL_CLASS.map((c, i) => (
          <span key={i} className={cx("size-3 rounded-[3px]", c)} />
        ))}
        <span>多</span>
        <span className="ml-2">最近 {weeks} 周</span>
      </div>
    </div>
  );
}
