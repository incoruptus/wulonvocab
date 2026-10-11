"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { ExportPreset, Wordbook } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { timeAgo } from "@/lib/utils";

/**
 * 导出预设管理：把调好的一版排版（纸张、栏数、主题与全部选项）存成命名方案，
 * 换词库时一键套用；预设随跨端同步，可重命名 / 用当前设置覆盖 / 删除（带撤销）。
 */
export function ExportPresetDialog({
  book,
  open,
  onOpenChange,
}: {
  book: Wordbook;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const presets = useAppStore((s) => s.exportPresets);
  const savePreset = useAppStore((s) => s.saveExportPreset);
  const updatePreset = useAppStore((s) => s.updateExportPreset);
  const removePreset = useAppStore((s) => s.removeExportPreset);
  const restorePreset = useAppStore((s) => s.restoreExportPreset);
  const updateSettings = useAppStore((s) => s.updateExportSettings);

  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  /** 行内撤销条：删除后原位提示，比 toast 更近（也避开弹窗与浮层的点击层级问题） */
  const [deleted, setDeleted] = useState<ExportPreset | null>(null);

  const sorted = [...presets].sort((a, b) => b.updatedAt - a.updatedAt);

  const apply = (p: ExportPreset) => {
    updateSettings(book.id, p.settings);
    toast.success(`已套用「${p.name}」`);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setDeleted(null);
        onOpenChange(v);
      }}
    >
      <DialogHeader
        title="导出预设"
        desc="把调好的一版排版存下来：纸张、栏数、主题与全部选项。换词库时一键套用，预设会跟着跨端同步。"
      />
      <DialogBody className="space-y-3">
        {deleted ? (
          <div className="flex items-center gap-2 rounded-lg bg-amber-700/10 px-3 py-2">
            <span className="t-label-12 min-w-0 flex-1 truncate text-amber-900">已删除「{deleted.name}」</span>
            <button
              type="button"
              className="t-label-12 shrink-0 underline underline-offset-2 text-amber-900 hover:text-amber-900/80"
              onClick={() => {
                restorePreset(deleted);
                setDeleted(null);
              }}
            >
              撤销
            </button>
            <button type="button" className="t-label-12 shrink-0 text-amber-900/70 hover:text-amber-900" onClick={() => setDeleted(null)}>
              知道了
            </button>
          </div>
        ) : null}
        {sorted.length === 0 ? (
          <p className="t-label-13 text-gray-800">还没有预设。在工作室里调好一版，点下面「保存当前设置」。</p>
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-background-200 px-3 py-2">
                {renamingId === p.id ? (
                  <>
                    <Input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updatePreset(p.id, { name: renameDraft });
                          setRenamingId(null);
                        }
                      }}
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        updatePreset(p.id, { name: renameDraft });
                        setRenamingId(null);
                      }}
                    >
                      确定
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRenamingId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="t-label-13 truncate text-gray-1000">{p.name}</div>
                      <div className="t-label-12 text-gray-700">更新于 {timeAgo(p.updatedAt)}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => apply(p)}>
                      套用
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton label="更多操作" size="sm">
                          <MoreHorizontal className="size-4" />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenamingId(p.id);
                            setRenameDraft(p.name);
                          }}
                        >
                          <Pencil className="size-3.5" /> 重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            updatePreset(p.id, { settings: book.exportSettings });
                            toast.success(`已用当前设置覆盖「${p.name}」`);
                          }}
                        >
                          <RefreshCw className="size-3.5" /> 用当前设置覆盖
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            removePreset(p.id);
                            setDeleted(p);
                          }}
                        >
                          <Trash2 className="size-3.5" /> 删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 border-t border-gray-300 pt-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`预设名称（默认「预设 ${sorted.length + 1}」）`}
            className="h-9"
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => {
              savePreset(name || `预设 ${sorted.length + 1}`, book.exportSettings);
              setName("");
              toast.success("已保存为预设");
            }}
          >
            <Save className="size-3.5" /> 保存当前设置
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}
