"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Brain, CalendarClock, Flame, Sparkles, Timer } from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { TopNav } from "@/components/app/TopNav";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Heatmap } from "@/components/learn/Heatmap";
import { buildAdvice, computeCapacity, estimateMinutes, type Advice } from "@/lib/study/advice";
import { computeHubMetrics, type HubMetrics } from "@/lib/study/metrics";
import { studyOverview, type StudyOverview } from "@/lib/study/queue";
import { requestSyncNow } from "@/lib/sync/auto";
import { cx, timeAgo } from "@/lib/utils";

interface BookSummary {
  book: Wordbook;
  overview: StudyOverview;
  progress: number;
}

const TONE_STYLE: Record<Advice["tone"], string> = {
  light: "bg-green-800/8 text-green-900",
  normal: "bg-blue-100/60 text-blue-1000",
  heavy: "bg-amber-700/12 text-amber-900",
  overdue: "bg-red-700/10 text-red-900",
};

export function LearnHub() {
  const hydrated = useAppStore((s) => s.hydrated);
  const books = useAppStore((s) => s.books);
  const lastBookId = useAppStore((s) => s.settings.lastBookId);

  const [metrics, setMetrics] = useState<HubMetrics | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [summaries, setSummaries] = useState<BookSummary[]>([]);
  /** 热力图实际显示范围（周数 + 区间复习合计；由 Heatmap 上报） */
  const [heatRange, setHeatRange] = useState<{ weeks: number; sum: number }>({ weeks: 13, sum: 0 });
  const onHeatRange = useCallback((range: { weeks: number; sum: number }) => {
    setHeatRange((prev) => (prev.weeks === range.weeks && prev.sum === range.sum ? prev : range));
  }, []);

  // 开始学习之前：拉一轮最新进度（静默；未配置自动同步时无感）
  useEffect(() => {
    requestSyncNow({ silent: true });
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const now = Date.now();
      const m = computeHubMetrics(books, now);
      const capacity = computeCapacity(books, m.newPerDayTotal, now);
      setMetrics(m);
      setAdvice(
        buildAdvice({
          due: m.due,
          overdue: m.overdue,
          newRemaining: m.newRemainingTotal,
          newPerDay: Math.max(1, m.newPerDayTotal),
          capacity,
        }),
      );
      setSummaries(
        books.map((book) => {
          const overview = studyOverview(book, now);
          const total = Math.max(1, book.entries.length);
          return { book, overview, progress: (overview.learning + overview.mastered) / total };
        }),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [books]);

  const continueTarget = useMemo(() => {
    if (!summaries.length) return null;
    const last = summaries.find((s) => s.book.id === lastBookId);
    if (last && (last.overview.due > 0 || last.overview.newRemaining > 0)) return last;
    const busiest = [...summaries].sort((a, b) => b.overview.due - a.overview.due)[0];
    if (busiest && busiest.overview.due > 0) return busiest;
    const newbie = summaries.find((s) => s.overview.newRemaining > 0);
    return newbie ?? last ?? summaries[0];
  }, [summaries, lastBookId]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopNav />
        <div className="flex flex-1 items-center justify-center text-gray-800">正在载入…</div>
      </div>
    );
  }

  const m = metrics;
  const minutes = m ? estimateMinutes(m.due, Math.min(advice?.suggestedNew ?? 0, m.newRemainingTotal)) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 pb-24 pt-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="t-h-24">学习中心</h1>
          {m && m.streak > 0 ? (
            <Badge variant="amber" size="md">
              <Flame className="size-3.5" /> 连续 {m.streak} 天
            </Badge>
          ) : null}
          {m && (m.reviewedToday > 0 || m.addedToday > 0) ? (
            <span className="t-label-12 text-gray-800">
              今日已复习 {m.reviewedToday} · 新学 {m.addedToday}
            </span>
          ) : null}
        </div>

        {!books.length ? (
          <Card className="py-0">
            <EmptyState
              icon={<BookOpen className="size-4" />}
              title="还没有词库"
              desc="先创建词库或导入词表，就能开始按记忆规律复习了。"
              action={
                <Link href="/books">
                  <Button size="sm">去创建词库</Button>
                </Link>
              }
            />
          </Card>
        ) : null}

        {/* 建议卡 */}
        {m && advice ? (
          <Card className={cx("space-y-3 border-0", TONE_STYLE[advice.tone])}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="t-h-16">{advice.title}</div>
                <p className="t-label-13 mt-1 max-w-[52ch] opacity-90">{advice.body}</p>
              </div>
              {continueTarget ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/study?id=${continueTarget.book.id}`}>
                    <Button>
                      <Brain className="size-4" />
                      {m.due + m.newRemainingTotal > 0 ? "开始学习" : "打开学习设置"}
                    </Button>
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] opacity-80">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" /> 待复习 {m.due}
                {m.overdue ? `（逾期 ${m.overdue}）` : ""}
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5" /> 建议新词 {advice.suggestedNew}
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" /> 大约 {minutes} 分钟
              </span>
            </div>
          </Card>
        ) : null}

        {/* 负载总览 */}
        {m ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="待复习" value={m.due} tone={m.due > 0 ? "amber" : "gray"} />
            <MiniStat label="逾期" value={m.overdue} tone={m.overdue > 0 ? "red" : "gray"} />
            <MiniStat label="剩余新词" value={m.newRemainingTotal} tone="blue" />
            <MiniStat label="已掌握" value={m.mastered} tone="green" />
          </div>
        ) : null}

        {/* 未来 7 天到期 */}
        {m ? (
          <Card className="space-y-3">
            <div className="t-h-14">未来 7 天要复习的词</div>
            {m.due7.some((v) => v > 0) ? (
              <div className="flex items-end gap-2" style={{ height: 128 }}>
                {m.due7.map((v, i) => {
                  const max = Math.max(1, ...m.due7);
                  const h = Math.max(4, Math.round((v / max) * 84));
                  return (
                    <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="t-mono-12 h-4 text-gray-800">{v || ""}</span>
                      <div
                        className={cx("w-full rounded-t-md", i === 0 ? "bg-blue-700/80" : "bg-blue-700/60")}
                        style={{ height: h }}
                      />
                      <span className="t-label-12 h-4 text-gray-700">{i === 0 ? "今天" : `+${i} 天`}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="t-label-12 text-gray-700">接下来 7 天没有安排复习，专心学新词就好。</p>
            )}
          </Card>
        ) : null}

        {/* 热力图（宽度自适应铺满）+ 健康指标 */}
        {m ? (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="t-h-14">复习热力图</div>
              {m.streak > 0 ? (
                <span className="t-label-12 text-gray-800">
                  连续学习：<span className="tabular-nums">{m.streak}</span> 天
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 t-label-12 text-gray-800">
              <span>
                近 {heatRange.weeks} 周复习：<span className="tabular-nums">{heatRange.sum}</span> 次
              </span>
              {m.accuracy30 !== null ? (
                <span>
                  近 30 天正确率 ≈ <span className="tabular-nums">{Math.round(m.accuracy30 * 100)}%</span>
                  <span className="text-gray-700">（目标 90%）</span>
                </span>
              ) : null}
              {m.medianStability !== null ? (
                <span>
                  记忆能撑多久（中位）：<span className="tabular-nums">{Math.round(m.medianStability)}</span> 天
                </span>
              ) : null}
            </div>
            <Heatmap counts={m.heatmap} onRangeChange={onHeatRange} />
          </Card>
        ) : null}

        {/* 词库列表 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="t-h-20">我的词库</h2>
            <Link href="/books" className="t-label-13 inline-flex items-center gap-1 text-blue-900 hover:underline">
              词库管理 <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {summaries.map(({ book, overview, progress }) => (
              <Card key={book.id} className="flex items-center gap-3 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-[19px]">
                  {book.meta?.coverEmoji || "📖"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/book?id=${book.id}`} className="t-h-14 truncate hover:underline">
                      {book.name}
                    </Link>
                    {overview.due > 0 ? (
                      <Badge variant="amber" size="sm">
                        待复习 {overview.due}
                      </Badge>
                    ) : null}
                    {overview.due === 0 && overview.newRemaining === 0 ? (
                      <Badge variant="green" size="sm">
                        今天已完成
                      </Badge>
                    ) : null}
                    <span className="t-label-12 text-gray-700">{timeAgo(book.updatedAt)}更新</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-green-700/80" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <span className="t-label-12 shrink-0 tabular-nums text-gray-800">
                      {overview.mastered + overview.learning}/{book.entries.length}
                    </span>
                  </div>
                </div>
                <Link href={`/study?id=${book.id}`} className="shrink-0">
                  <Button size="sm" variant={overview.due > 0 || overview.newRemaining > 0 ? "default" : "secondary"}>
                    <Brain className="size-3.5" /> 学习
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" | "green" | "red" | "gray" }) {
  const toneClass =
    tone === "amber"
      ? "text-amber-900"
      : tone === "blue"
        ? "text-blue-900"
        : tone === "green"
          ? "text-green-900"
          : tone === "red"
            ? "text-red-900"
            : "text-gray-1000";
  return (
    <Card className="p-3.5">
      <div className={cx("t-h-24 tabular-nums", toneClass)}>{value}</div>
      <div className="t-label-12 mt-0.5 text-gray-800">{label}</div>
    </Card>
  );
}
