"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";
import { buildHeatmapGrid, heatmapLevel, heatmapWeeksForWidth, type HeatmapColumn } from "@/lib/study/heatmap";

/**
 * 复习热力图（13–26 周，宽度自适应铺满容器）
 * 输入 { "YYYY-MM-DD": 复习次数 }；网格在挂载 / 容器尺寸变化后计算（渲染期不读时间）。
 * onRangeChange：把实际显示范围（周数 + 区间内复习合计）上报给宿主（用于「近 N 周复习」文案）。
 */
export function Heatmap({
  counts,
  onRangeChange,
}: {
  counts: Record<string, number>;
  onRangeChange?: (range: { weeks: number; sum: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState<HeatmapColumn[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const rebuild = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = host.clientWidth;
        const weeks = heatmapWeeksForWidth(width);
        const next = buildHeatmapGrid(counts, Date.now(), weeks);
        setCols(next);
        const sum = next.flatMap((c) => c.cells).reduce((a, c) => a + c.count, 0);
        onRangeChange?.({ weeks: next.length, sum });
      });
    };
    rebuild();
    const ro = new ResizeObserver(rebuild);
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // onRangeChange 变化不触发重建（避免宿主重渲染循环）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  const LEVEL_CLASS = [
    "bg-gray-100",
    "bg-blue-200",
    "bg-blue-400",
    "bg-blue-600",
    "bg-blue-800",
  ];

  return (
    <div ref={hostRef} className="select-none">
      {cols.length ? (
        <>
          <div className="flex gap-[4px]">
            {cols.map((col, ci) => (
              <div key={ci} className="min-w-0 flex-1">
                <span className="t-label-12 block h-4 whitespace-nowrap text-gray-700">{col.label ?? ""}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[4px]">
            {cols.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-[4px]">
                {col.cells.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${cell.date} · ${cell.count} 次复习`}
                    className={cx(
                      "aspect-square w-full rounded-[3px]",
                      cell.future ? "bg-gray-100/60" : LEVEL_CLASS[heatmapLevel(cell.count)],
                      cell.today && "ring-1 ring-blue-700/50",
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="min-h-24" />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-700">
        <span>少</span>
        {LEVEL_CLASS.map((c, i) => (
          <span key={i} className={cx("size-3 rounded-[3px]", c)} />
        ))}
        <span>多</span>
        <span className="ml-auto">最近 {cols.length || 13} 周 · 每格一天，今天带描边</span>
      </div>
    </div>
  );
}
