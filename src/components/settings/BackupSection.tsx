"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DownloadCloud, Trash2, Upload } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { downloadText } from "@/lib/utils";
import { clearReviewLog, listReviewLog, serializeReviewLog } from "@/lib/study/reviewLog";
import { clearAiClozeCache } from "@/lib/study/clozeAi";

/** 备份与恢复：导出 / 恢复 JSON、清空所有数据 */
export function BackupSection() {
  const importBackupJson = useAppStore((s) => s.importBackupJson);
  const exportBackupJson = useAppStore((s) => s.exportBackupJson);
  const [clearOpen, setClearOpen] = useState(false);
  const [logClearOpen, setLogClearOpen] = useState(false);
  const [logCount, setLogCount] = useState<number | null>(null);
  const refreshLogCount = async () => setLogCount((await listReviewLog()).length);

  return (
    <>
      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              downloadText(`wulonvocab-backup-${Date.now()}.json`, exportBackupJson());
              toast.success("备份已导出");
            }}
          >
            <DownloadCloud className="size-3.5" /> 导出备份
          </Button>
          <label>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const res = importBackupJson(await file.text());
                if (res.ok) {
                  toast.success(`备份恢复完成：${res.books} 个词库`, {
                    description: res.warnings?.length ? res.warnings[0] : undefined,
                  });
                } else {
                  toast.error(`恢复失败：${res.error}`);
                }
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-background-100 px-3.5 text-[14px] font-medium text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100">
              <Upload className="size-3.5" /> 恢复备份
            </span>
          </label>
          <Button variant="tertiary" className="text-red-900" onClick={() => setClearOpen(true)}>
            <Trash2 className="size-3.5" /> 清空所有数据
          </Button>
        </div>
        <p className="t-label-12 text-gray-700">
          提示：删除浏览器数据会同时清空词库，请定期导出备份或使用「导出 JSON」保存单个词库。
        </p>
      </Card>

      <Card className="space-y-3">
        <div className="t-h-16">本机复习日志</div>
        <p className="t-label-12 text-gray-700">
          记录每次评分、题型、用时与撤销补偿，用来观察学习过程。它只在这台设备上，不进入词库备份或跨端同步。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const events = await listReviewLog();
              setLogCount(events.length);
              downloadText(`wulonvocab-review-log-${Date.now()}.json`, serializeReviewLog(events));
              toast.success(`已导出 ${events.length} 条本机记录`);
            }}
          >
            <DownloadCloud className="size-3.5" /> 导出复习日志
          </Button>
          <Button
            variant="tertiary"
            onClick={async () => {
              await refreshLogCount();
              setLogClearOpen(true);
            }}
          >
            查看 / 清理
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="t-h-16">AI 例句缓存</div>
        <p className="t-label-12 text-gray-700">开启 AI 补句后，生成并验证过的短句只保存在本机。清理后会重新生成，可能再次产生 API 用量。</p>
        <Button
          variant="tertiary"
          onClick={async () => {
            await clearAiClozeCache();
            toast.success("AI 例句缓存已清理");
          }}
        >
          清理 AI 例句缓存
        </Button>
      </Card>

      <Dialog open={logClearOpen} onOpenChange={setLogClearOpen}>
        <DialogHeader
          title="清理本机复习日志"
          desc={`当前有 ${logCount ?? 0} 条记录。清理不会改变词条、复习安排或每日统计。`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setLogClearOpen(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              await clearReviewLog();
              setLogCount(0);
              setLogClearOpen(false);
              toast.success("本机复习日志已清理");
            }}
          >
            确认清理
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogHeader title="清空所有数据" desc="将删除全部词库、设置与本地词库缓存，且不可恢复。建议先导出备份。" />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              try {
                const { clear } = await import("idb-keyval");
                await clear();
                await clearReviewLog();
                await clearAiClozeCache();
              } catch {
                /* ignore */
              }
              localStorage.removeItem("wulonvocab-v1");
              location.reload();
            }}
          >
            确认清空
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
