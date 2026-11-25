"use client";

import { useEffect, useState } from "react";
import { CalendarClock, PenLine, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { studyConfigOf } from "@/lib/study/queue";
import { leechInfoOf } from "@/lib/study/leech";
import { cx, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";

/** 顽固词半阈值预告、正式标记与三种处置入口。 */
export function LeechNotice({
  book,
  entry,
  onEdit,
}: {
  book: Wordbook;
  entry: Entry;
  onEdit?: () => void;
}) {
  const setEntrySuspension = useAppStore((s) => s.setEntrySuspension);
  const resetEntrySrs = useAppStore((s) => s.resetEntrySrs);
  const [now, setNow] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const info = leechInfoOf(entry, now, studyConfigOf(book).leechThreshold);
  if (info.level === "none") return null;

  const suspended = info.level === "suspended";
  const leech = info.level === "leech";
  const title = suspended
    ? "这个词已暂时搁置"
    : leech
      ? `顽固词 · 已忘记 ${info.lapses} 次`
      : `易忘提醒 · 已忘记 ${info.lapses}/${info.threshold} 次`;

  const suspend = (days: 7 | 30) => {
    setEntrySuspension(book.id, entry.id, days);
    toast.success(`已搁置 ${days} 天，学习记录保持不变`);
  };

  return (
    <section
      aria-label="顽固词提醒"
      className={cx(
        "space-y-3 rounded-xl border p-3.5",
        leech ? "border-red-300 bg-red-700/5" : "border-amber-300 bg-amber-700/5",
      )}
    >
      <div>
        <div className={cx("t-label-13 font-medium", leech ? "text-red-900" : "text-amber-900")}>{title}</div>
        <p className="t-label-12 mt-1 text-gray-800">
          {suspended
            ? `将在 ${formatDateTime(info.until!)} 自动回到原队列；这期间不改到期时间，也不改学习记录。`
            : leech
              ? "先别硬背。可以暂时搁置、改卡降低一次要记的信息量，或降级重学。"
              : `再忘记 ${Math.max(0, info.threshold - info.lapses)} 次会达到顽固词阈值，可以先改卡或添加一条自撰例句。`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suspended ? (
          <Button
            size="sm"
            onClick={() => {
              setEntrySuspension(book.id, entry.id, null);
              toast.success("已解除搁置，按原计划继续");
            }}
          >
            <RotateCcw className="size-3.5" /> 立即恢复
          </Button>
        ) : leech ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => suspend(7)}>
              <CalendarClock className="size-3.5" /> 搁置 7 天
            </Button>
            <Button size="sm" variant="secondary" onClick={() => suspend(30)}>
              <CalendarClock className="size-3.5" /> 搁置 30 天
            </Button>
          </>
        ) : null}
        {onEdit ? (
          <Button size="sm" variant="tertiary" onClick={onEdit}>
            <PenLine className="size-3.5" /> 改卡
          </Button>
        ) : null}
        {leech ? (
          <Button size="sm" variant="tertiary" onClick={() => setResetOpen(true)}>
            降级重学
          </Button>
        ) : null}
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogHeader title="降级为未学？" desc="保留词条内容、标签与星标，只清除这个词的学习记录和搁置。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">之后会重新进入新词三步流程。已经积累的 R(30)、复习次数与遗忘次数会归零。</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              resetEntrySrs(book.id, entry.id);
              setResetOpen(false);
              toast.success("已降级为未学，内容已保留");
            }}
          >
            确认降级重学
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
