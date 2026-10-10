"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft, Download, FileDown, Layers, MoreHorizontal, PanelRight, Pencil, Search, Trash2, Upload, Wand2,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { isValueEmpty, sortSections } from "@/lib/sections";
import { serializeBookDoc } from "@/lib/serializers";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { EntryList } from "@/components/book/EntryList";
import { EntryEditor } from "@/components/book/EntryEditor";
import { SchemaDesigner } from "@/components/book/SchemaDesigner";
import { LookupPanel } from "@/components/lookup/LookupPanel";
import { ImportDialog } from "@/components/import/ImportDialog";
import { EntryHeaderBlock, SectionBlock, type CardCtx } from "@/components/export/blocks";
import { downloadText, slugify } from "@/lib/utils";
import { TopNav } from "@/components/app/TopNav";

export function BookWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const hydrated = useAppStore((s) => s.hydrated);
  const book = useAppStore((s) => s.books.find((b) => b.id === id));
  const [tab, setTab] = useState<"entries" | "fields">("entries");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const selected = useMemo(() => {
    if (!book) return null;
    return book.entries.find((e) => e.id === selectedId) ?? book.entries[0] ?? null;
  }, [book, selectedId]);

  if (!hydrated) {
    return (
      <div className="flex h-dvh items-center justify-center text-gray-800">正在载入…</div>
    );
  }
  if (!book) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <EmptyState
          title="未找到该词库"
          desc="它可能已被删除，或链接不正确。"
          action={
            <Link href="/">
              <Button variant="secondary">返回词库列表</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopNav
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> 导入
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setLookupOpen(true)}>
              <Search className="size-3.5" /> 检索
            </Button>
            <Link href={`/book/${book.id}/export`}>
              <Button size="sm">
                <FileDown className="size-3.5" /> 导出工作室
              </Button>
            </Link>
          </>
        }
      />

      {/* 词库头 */}
      <div className="flex items-center gap-3 border-b border-gray-300 px-4 py-2.5">
        <Link href="/" className="t-label-13 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000">
          <ChevronLeft className="size-3.5" /> 词库
        </Link>
        <span className="text-gray-500">/</span>
        <span className="t-h-16 max-w-64 truncate">{book.name}</span>
        <span className="t-label-12 text-gray-700">
          {book.entries.length} 词 · {book.schema.sections.length} 字段
        </span>
        <div className="ml-3">
          <SegmentedControl
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "entries", label: "词条编辑" },
              { value: "fields", label: "字段设计" },
            ]}
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={showPreview ? "隐藏预览" : "显示预览"}
            className={showPreview ? "bg-gray-100" : ""}
            onClick={() => setShowPreview((v) => !v)}
          >
            <PanelRight className="size-4" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="词库操作">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setRenameValue(book.name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="size-3.5" /> 重命名 / 编辑信息
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  useAppStore.getState().duplicateBook(book.id);
                  toast.success("已复制词库");
                }}
              >
                <Layers className="size-3.5" /> 复制词库
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  downloadText(`${slugify(book.name)}.json`, serializeBookDoc(book));
                  toast.success("已导出 JSON", { description: "包含字段表与全部词条，可再次导入" });
                }}
              >
                <Download className="size-3.5" /> 导出 JSON（含字段表）
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" /> 删除词库
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 主体 */}
      {tab === "entries" ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[320px] shrink-0 border-r border-gray-300">
            <EntryList book={book} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="min-w-0 flex-1">
            {selected ? (
              <EntryEditor
                key={selected.id}
                book={book}
                entry={selected}
                onDeleted={() => setSelectedId(null)}
                onRequestLookup={() => setLookupOpen(true)}
              />
            ) : (
              <EmptyState
                icon={<Wand2 className="size-4" />}
                title={book.entries.length ? "选择一个词条开始编辑" : "创建你的第一个词条"}
                desc="左侧列表选择词条；也可以用「检索」从词典获取，或「导入」批量写入。"
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const e = useAppStore.getState().addEntry(book.id, { headword: "" });
                        if (e) setSelectedId(e.id);
                      }}
                    >
                      新建词条
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setLookupOpen(true)}>
                      <Search className="size-3.5" /> 词典检索
                    </Button>
                  </div>
                }
              />
            )}
          </div>
          {showPreview && selected ? (
            <PreviewPanel book={book} entry={selected} onClose={() => setShowPreview(false)} />
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <SchemaDesigner book={book} />
        </div>
      )}

      <LookupPanel
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        book={book}
        targetEntry={selected}
        onApplied={(eid) => setSelectedId(eid)}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetBook={book}
        onImported={() => toast.success("导入完成")}
      />

      {/* 重命名对话框 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogHeader title="词库信息" desc="名称同时用于封面与导出文件名。" />
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">名称</div>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">描述</div>
            <Input
              value={book.description ?? ""}
              onChange={(e) => useAppStore.getState().updateBook(book.id, { description: e.target.value })}
              placeholder="一句话说明这个词库"
            />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">封面表情</div>
            <Input
              value={book.meta?.coverEmoji ?? ""}
              onChange={(e) => useAppStore.getState().updateBook(book.id, { meta: { ...book.meta, coverEmoji: e.target.value } })}
              placeholder="例如 📖"
              className="w-24"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRenameOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              useAppStore.getState().updateBook(book.id, { name: renameValue.trim() || book.name });
              setRenameOpen(false);
              toast.success("已保存");
            }}
          >
            保存
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader
          title="删除词库"
          desc={`「${book.name}」包含 ${book.entries.length} 个词条，删除后不可恢复。建议先导出 JSON 备份。`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={() => {
              useAppStore.getState().deleteBook(book.id);
              toast.success("词库已删除");
              router.push("/");
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ---------------- 实时预览面板 ---------------- */

function PreviewPanel({ book, entry, onClose }: { book: NonNullable<ReturnType<typeof useAppStore.getState>["books"][number]>; entry: Entry; onClose: () => void }) {
  const settings = book.exportSettings;
  const ctx: CardCtx = { settings, schema: book.schema };
  const sections = sortSections(book.schema.sections)
    .filter((sec) => settings.sectionVisibility[sec.id] ?? sec.visible)
    .filter((sec) => !settings.hideEmpty || !isValueEmpty(sec.type, entry.values[sec.key]));

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-gray-300 bg-background-200">
      <div className="flex items-center gap-2 border-b border-gray-300 px-3 py-2.5">
        <span className="t-h-14">实时预览</span>
        <Badge variant="gray" size="sm">
          {settings.cardStyle === "classic" ? "经典" : settings.cardStyle === "minimal" ? "极简" : settings.cardStyle === "compact" ? "紧凑" : "手账"}
        </Badge>
        <span className="t-label-12 text-gray-700">以导出样式渲染</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href={`/book/${book.id}/export`}>
            <Button size="sm" variant="secondary">
              <FileDown className="size-3.5" /> 导出
            </Button>
          </Link>
          <IconButton label="关闭预览" size="sm" onClick={onClose}>
            <PanelRight className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">
        <div
          className="wv-card mx-auto max-w-[300px] rounded-xl bg-white p-4 shadow-geist-md"
          style={{
            fontSize: `${10.5 * settings.fontScale}pt`,
            lineHeight: settings.lineHeight,
            color: "#1b1b1b",
            fontFamily: settings.fontFamily === "serif" ? undefined : undefined,
          }}
        >
          <EntryHeaderBlock entry={entry} ctx={ctx} index={0} />
          <div className="mt-[0.7em] space-y-[0.55em]">
            {sections.map((sec) => (
              <SectionBlock key={sec.id} entry={entry} section={sec} ctx={ctx} />
            ))}
          </div>
        </div>
        <p className="t-label-12 mt-3 text-center text-gray-700">
          纸张、字号、强调色等可在导出工作室中调整
        </p>
      </div>
    </aside>
  );
}
