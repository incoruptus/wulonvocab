"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { cx, downloadText, slugify } from "@/lib/utils";
import { TopNav } from "@/components/app/TopNav";

export function BookWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
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
  /** 窄屏主从视图：词条列表 / 编辑器 */
  const [mobilePane, setMobilePane] = useState<"list" | "editor">("list");

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
        hideNavOnMobile
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> 导入
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setLookupOpen(true)}>
              <Search className="size-3.5" /> 检索
            </Button>
            <Link href={`/book/export?id=${book.id}`}>
              <Button size="sm">
                <FileDown className="size-3.5" />
                导出<span className="hidden sm:inline">工作室</span>
              </Button>
            </Link>
          </>
        }
      />

      {/* 词库头 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-300 px-3 py-2.5 sm:px-4">
        <Link href="/" className="t-label-13 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000">
          <ChevronLeft className="size-3.5" /> 词库
        </Link>
        <span className="text-gray-500">/</span>
        <span className="t-h-16 max-w-40 truncate sm:max-w-64">{book.name}</span>
        <span className="t-label-12 hidden text-gray-700 md:inline">
          {book.entries.length} 个词 · {book.schema.sections.length} 个字段
        </span>
        <div className="order-last w-full sm:order-none sm:ml-3 sm:w-auto">
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
            className={cx("hidden xl:inline-flex", showPreview && "bg-gray-100")}
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
                  toast.success("已复制成一册新的");
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
          <div
            className={cx(
              "w-full shrink-0 border-r border-gray-300 lg:block lg:w-[320px]",
              mobilePane === "editor" ? "hidden" : "block",
            )}
          >
            <EntryList
              book={book}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) setMobilePane("editor");
              }}
            />
          </div>
          <div className={cx("min-w-0 flex-1", mobilePane === "list" ? "hidden lg:block" : "block")}>
            {selected ? (
              <EntryEditor
                key={selected.id}
                book={book}
                entry={selected}
                onBack={() => setMobilePane("list")}
                onDeleted={() => {
                  setSelectedId(null);
                  setMobilePane("list");
                }}
                onRequestLookup={() => setLookupOpen(true)}
              />
            ) : (
              <EmptyState
                icon={<Wand2 className="size-4" />}
                title={book.entries.length ? "从左边挑一个词，开始写" : "先写你的第一个词"}
                desc="点开左侧词条就能编辑；「词典检索」拉来音标与释义，「导入」整批写入。右侧实时预览它在纸上的样子。"
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const e = useAppStore.getState().addEntry(book.id, { headword: "" });
                        if (e) {
                          setSelectedId(e.id);
                          setMobilePane("editor");
                        }
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
          ) : null}        </div>
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
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-gray-300 bg-background-200 xl:flex">
      <div className="flex items-center gap-2 border-b border-gray-300 px-3 py-2.5">
        <span className="t-h-14">实时预览</span>
        <Badge variant="gray" size="sm">
          {settings.cardStyle === "classic" ? "经典" : settings.cardStyle === "minimal" ? "极简" : settings.cardStyle === "compact" ? "紧凑" : "手账"}
        </Badge>
        <span className="t-label-12 text-gray-700">以导出样式渲染</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href={`/book/export?id=${book.id}`}>
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
