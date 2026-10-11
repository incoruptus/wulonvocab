"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  ChevronLeft, Download, FileDown, Layers, MoreHorizontal, PanelRight, Pencil, Search, Sparkles, Trash2, Upload, Wand2,
} from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { serializeBookDoc } from "@/lib/serializers";
import { useAppStore } from "@/lib/store";
import { AgentPanel } from "@/components/ai/AgentPanel";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { EntryList } from "@/components/book/EntryList";
import { EntryEditor } from "@/components/book/EntryEditor";
import { EntryPreviewCard } from "@/components/book/EntryPreview";
import { SchemaDesigner } from "@/components/book/SchemaDesigner";
import { LookupPanel } from "@/components/lookup/LookupPanel";
import { ImportDialog } from "@/components/import/ImportDialog";
import { studyOverview } from "@/lib/study/queue";
import { normalizeCardStyle, themeById } from "@/lib/export/themes";
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
  const [lookupIntent, setLookupIntent] = useState<{ tab: "single" | "batch" | "fill"; ids?: string[] }>({ tab: "single" });
  const [agentOpen, setAgentOpen] = useState(false);
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

  const dueCount = useMemo(() => (book ? studyOverview(book).due : 0), [book]);

  /* ---------------- 多选与批量操作 ---------------- */

  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [pendingResetStatus, setPendingResetStatus] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const [tagInput, setTagInput] = useState("");
  const anchorRef = useRef<string | null>(null);

  /** 打开检索面板（可带页签与补全范围意图；批量栏用 fill 页签 + 选中集） */
  const openLookup = (intent?: { tab?: "single" | "batch" | "fill"; ids?: string[] }) => {
    setLookupIntent({ tab: intent?.tab ?? "single", ids: intent?.ids });
    setLookupOpen(true);
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelection(new Set());
    anchorRef.current = null;
  };

  const enterSelect = (id: string) => {
    setSelecting(true);
    anchorRef.current = id || null;
    setSelection((prev) => {
      const next = new Set(prev);
      if (id) next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string, opts: { shift: boolean }, filteredIds: string[]) => {
    if (!book) return;
    setSelecting(true);
    const next = new Set(selection);
    if (opts.shift && anchorRef.current) {
      const a = filteredIds.indexOf(anchorRef.current);
      const b = filteredIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const shouldSelect = !selection.has(id);
        for (let i = lo; i <= hi; i += 1) {
          if (shouldSelect) next.add(filteredIds[i]);
          else next.delete(filteredIds[i]);
        }
        setSelection(next);
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    anchorRef.current = id;
    setSelection(next);
  };

  const quickDelete = (entry: Entry) => {
    if (!book) return;
    const index = book.entries.findIndex((e) => e.id === entry.id);
    if (index < 0) return;
    useAppStore.getState().removeEntries(book.id, [entry.id]);
    if (entry.id === selectedId) setSelectedId(null);
    toast.success("已删除 1 个词条", {
      action: { label: "撤销", onClick: () => useAppStore.getState().restoreEntries(book.id, [{ entry, index }]) },
    });
  };

  const doBatchDelete = (ids: string[]) => {
    if (!book || !ids.length) return;
    const snapshot = ids
      .map((id) => {
        const index = book.entries.findIndex((e) => e.id === id);
        return index >= 0 ? { entry: book.entries[index], index } : null;
      })
      .filter((x): x is { entry: Entry; index: number } => x !== null);
    useAppStore.getState().removeEntries(book.id, ids);
    setSelectedId((cur) => (cur && ids.includes(cur) ? null : cur));
    exitSelect();
    toast.success(`已删除 ${ids.length} 个词条`, {
      action: { label: "撤销", onClick: () => useAppStore.getState().restoreEntries(book.id, snapshot) },
    });
  };

  const requestBatchDelete = () => {
    if (!book) return;
    const ids = [...selection].filter((id) => book.entries.some((e) => e.id === id));
    if (!ids.length) return;
    const risky = ids.length >= 20 || ids.some((id) => Boolean(book.entries.find((e) => e.id === id)?.srs));
    if (risky) setPendingDelete(ids);
    else doBatchDelete(ids);
  };

  const batchStatus = (status: "new" | "learning" | "mastered") => {
    if (!book) return;
    const ids = [...selection].filter((id) => book.entries.some((e) => e.id === id));
    if (!ids.length) return;
    if (status === "new" && ids.some((id) => Boolean(book.entries.find((e) => e.id === id)?.srs))) {
      setPendingResetStatus(true);
      return;
    }
    useAppStore.getState().setEntriesStatus(book.id, ids, status);
    toast.success(`已把 ${ids.length} 个词条设为「${status === "new" ? "未学" : status === "learning" ? "在学" : "已掌握"}」`);
  };

  const batchStar = (starred: boolean) => {
    if (!book) return;
    const ids = [...selection].filter((id) => book.entries.some((e) => e.id === id));
    if (!ids.length) return;
    useAppStore.getState().setEntriesStarred(book.id, ids, starred);
    toast.success(starred ? `已星标 ${ids.length} 个词条` : `已取消星标 ${ids.length} 个词条`);
  };

  const exportSelected = () => {
    if (!book) return;
    const ids = new Set(selection);
    const subset: Wordbook = { ...book, entries: book.entries.filter((e) => ids.has(e.id)) };
    downloadText(`${slugify(book.name)}-所选-${subset.entries.length}.json`, serializeBookDoc(subset));
    toast.success(`已导出 ${subset.entries.length} 个词条`);
  };

  const applyTags = () => {
    if (!book) return;
    const tags = tagInput
      .split(/[,，;；、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tags.length) {
      toast.error("请输入标签");
      return;
    }
    const ids = [...selection].filter((id) => book.entries.some((e) => e.id === id));
    useAppStore.getState().updateEntriesTags(book.id, ids, tagMode === "add" ? tags : [], tagMode === "remove" ? tags : []);
    toast.success(`${tagMode === "add" ? "已添加" : "已移除"}标签：${tags.join("、")}`, { description: `影响 ${ids.length} 个词条` });
    setTagOpen(false);
    setTagInput("");
  };

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
            <Link href="/books">
              <Button variant="secondary">返回词库列表</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <TopNav
        right={
          <>
            <Link href={`/study?id=${book.id}`}>
              <Button size="sm" className="gap-1.5">
                <Brain className="size-3.5" /> <span className="hidden sm:inline">学习</span>
                {dueCount > 0 ? (
                  <span className="t-mono-12 rounded-full bg-amber-700/25 px-1.5 text-[10px] text-amber-900">{dueCount}</span>
                ) : null}
              </Button>
            </Link>
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="size-3.5" /> 导入
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openLookup()}>
                <Search className="size-3.5" /> 检索
              </Button>
              <IconButton label="AI 词库管家" onClick={() => setAgentOpen(true)}>
                <Sparkles className="size-4" />
              </IconButton>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="更多操作" className="sm:hidden">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <Upload className="size-3.5" /> 导入
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openLookup()}>
                  <Search className="size-3.5" /> 词典检索
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAgentOpen(true)}>
                  <Sparkles className="size-3.5" /> AI 词库管家
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link href={`/book/export?id=${book.id}`}>
              <Button size="sm" variant="secondary">
                <FileDown className="size-3.5" />
                导出<span className="hidden sm:inline">工作室</span>
              </Button>
            </Link>
          </>
        }
      />

      {/* 词库头 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-300 px-3 py-2.5 sm:px-4">
        <Link href="/books" className="t-label-13 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000">
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
            onValueChange={(v) => {
              setTab(v);
              if (v !== "entries") exitSelect();
            }}
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
              selecting={selecting}
              selection={selection}
              onToggleSelect={toggleSelect}
              onEnterSelect={enterSelect}
              onExitSelect={exitSelect}
              onSelectAllFiltered={(ids) => setSelection(new Set(ids))}
              onRequestBatchStatus={batchStatus}
              onRequestBatchTags={() => setTagOpen(true)}
              onRequestBatchStar={batchStar}
              onRequestBatchDelete={requestBatchDelete}
              onRequestExportSelected={exportSelected}
              onRequestBatchLookup={() => openLookup({ tab: "fill", ids: [...selection] })}
              onQuickDelete={quickDelete}
              onStar={(entry) => useAppStore.getState().toggleStar(book.id, entry.id)}
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
                onRequestLookup={() => openLookup()}
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
                    <Button variant="secondary" size="sm" onClick={() => openLookup()}>
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
        initialTab={lookupIntent.tab}
        fillEntryIds={lookupIntent.ids}
      />

      <AgentPanel key={book.id} book={book} open={agentOpen} onOpenChange={setAgentOpen} />
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
              router.push("/books");
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 批量删除确认（≥20 或含学习进度） */}
      <Dialog open={pendingDelete !== null} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogHeader
          title={`删除 ${pendingDelete?.length ?? 0} 个词条？`}
          desc={
            pendingDelete?.some((id) => Boolean(book.entries.find((e) => e.id === id)?.srs))
              ? "其中有词条已带学习记录，删除后将一并移除；删除后 6 秒内可撤销。"
              : "删除后 6 秒内可撤销。"
          }
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={() => {
              const ids = pendingDelete ?? [];
              setPendingDelete(null);
              doBatchDelete(ids);
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 「未学」会清除学习进度的确认 */}
      <Dialog open={pendingResetStatus} onOpenChange={setPendingResetStatus}>
        <DialogHeader
          title="清除所选词条的学习进度？"
          desc="其中部分词条已有学习记录。设为「未学」会同时清掉复习安排（历史保留在每日统计中），此操作可用「撤销」恢复。"
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingResetStatus(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={() => {
              if (!book) return;
              const ids = [...selection];
              const snapshot = ids.map((id) => {
                const index = book.entries.findIndex((e) => e.id === id);
                return index >= 0 ? { entry: { ...book.entries[index] }, index } : null;
              }).filter((x): x is { entry: Entry; index: number } => x !== null);
              useAppStore.getState().setEntriesStatus(book.id, ids, "new");
              setPendingResetStatus(false);
              toast.success(`已把 ${ids.length} 个词条设为「未学」`, {
                action: {
                  label: "撤销",
                  onClick: () => {
                    for (const { entry } of snapshot) useAppStore.getState().updateEntry(book.id, entry.id, { srs: entry.srs, status: entry.status });
                  },
                },
              });
            }}
          >
            确认清除
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 批量标签 */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogHeader title="批量标签" desc="输入一个或多个标签（用逗号 / 空格分隔），应用到所选词条。" />
        <DialogBody className="space-y-3">
          <SegmentedControl
            value={tagMode}
            onValueChange={setTagMode}
            options={[
              { value: "add", label: "添加标签" },
              { value: "remove", label: "移除标签" },
            ]}
            grow
          />
          <div className="space-y-1.5">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTags()}
              placeholder="如：cet4 考研 学术"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(book.entries.flatMap((e) => e.tags))].slice(0, 12).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagInput((prev) => (prev ? `${prev} ${t}` : t))}
                  className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] text-gray-900 hover:bg-gray-200"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <p className="t-label-12 text-gray-700">影响 {selection.size} 个所选词条；不会影响未列出的标签。</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setTagOpen(false)}>
            取消
          </Button>
          <Button onClick={applyTags}>应用</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ---------------- 实时预览面板 ---------------- */

function PreviewPanel({ book, entry, onClose }: { book: NonNullable<ReturnType<typeof useAppStore.getState>["books"][number]>; entry: Entry; onClose: () => void }) {
  const settings = book.exportSettings;

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-gray-300 bg-background-200 xl:flex">
      <div className="flex items-center gap-2 border-b border-gray-300 px-3 py-2.5">
        <span className="t-h-14">实时预览</span>
        <Badge variant="gray" size="sm">
          {themeById(normalizeCardStyle(settings.cardStyle)).name}
        </Badge>
        <span className="t-label-12 text-gray-700">按导出样式显示</span>
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
        <EntryPreviewCard book={book} entry={entry} className="mx-auto max-w-[300px]" />
        <p className="t-label-12 mt-3 text-center text-gray-700">
          纸张、字号、强调色等可在导出工作室中调整
        </p>
      </div>
    </aside>
  );
}
