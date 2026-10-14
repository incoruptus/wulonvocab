"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, DownloadCloud, Trash2, Upload } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/misc";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { downloadText } from "@/lib/utils";

/** 备份与恢复：导出 / 恢复 JSON、清空所有数据 */
export function BackupSection() {
  const importBackupJson = useAppStore((s) => s.importBackupJson);
  const exportBackupJson = useAppStore((s) => s.exportBackupJson);
  const [clearOpen, setClearOpen] = useState(false);

  return (
    <>
      <Card className="space-y-4">
        <CardTitle desc="词库、字段表、检索配置打包成一个 JSON；换电脑、重装浏览器，原样恢复。">
          <span className="inline-flex items-center gap-2">
            <Archive className="size-4 text-gray-800" /> 备份与恢复
          </span>
        </CardTitle>
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
