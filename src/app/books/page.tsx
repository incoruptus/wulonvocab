"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight, Archive, BookOpen, Brain, Download, FileDown, FileJson, Layers, MoreHorizontal, Pause, Pencil, Plus, RotateCcw, Sparkles, Trash2, Upload, WandSparkles,
} from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { SCHEMA_PRESETS } from "@/lib/presets";
import { serializeBookDoc } from "@/lib/serializers";
import { studyOverview, studyStateOf } from "@/lib/study/queue";
import { useAppStore } from "@/lib/store";
import { TopNav } from "@/components/app/TopNav";
import { ImportDialog } from "@/components/import/ImportDialog";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { cx, downloadText, slugify, timeAgo } from "@/lib/utils";

export default function BooksPage() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const books = useAppStore((s) => s.books);
  const createBook = useAppStore((s) => s.createBook);
  const addSampleBook = useAppStore((s) => s.addSampleBook);
  const deleteBook = useAppStore((s) => s.deleteBook);
  const setBookStudyState = useAppStore((s) => s.setBookStudyState);
  const resetBookStudyProgress = useAppStore((s) => s.resetBookStudyProgress);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [restoring, setRestoring] = useState<Wordbook | null>(null);
  const [name, setName] = useState("");
  const [presetId, setPresetId] = useState("oxford");

  // 命令面板等入口深链：/books?new=1 直接打开新建弹窗（rAF 回调内 setState，规避同步 effect setState）
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (window.location.search.includes("new=1")) setNewOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const [deleting, setDeleting] = useState<Wordbook | null>(null);

  const stats = useMemo(() => {
    const entries = books.reduce((acc, b) => acc + b.entries.length, 0);
    const fields = books.reduce((acc, b) => acc + b.schema.sections.length, 0);
    return { entries, fields };
  }, [books]);
  const archivedCount = books.filter((book) => studyStateOf(book) === "archived").length;
  const visibleBooks = showArchived ? books : books.filter((book) => studyStateOf(book) !== "archived");

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 pb-24 pt-6 sm:space-y-10 sm:px-6 sm:py-8">
                {/* 词库页头 */}
        <section className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="t-h-24">我的词库</h1>
            <p className="t-label-13 mt-1 text-gray-800">每个词库都有自己的字段与进度，接着写、接着背，也可以把它排成一本能打印的书。</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> 新建词库
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> 导入为新词库
            </Button>
            <Button variant="secondary" onClick={() => router.push("/import?panel=ai")}>
              <WandSparkles className="size-4" /> AI 生词库
            </Button>
            <Button
              variant="tertiary"
              onClick={() => {
                const b = addSampleBook();
                toast.success("示例已建好：10 个词、14 种字段，直接看效果");
                router.push(`/book?id=${b.id}`);
              }}
            >
              <Sparkles className="size-4" /> 创建示例（10 词）
            </Button>
          </div>
        </section>

{/* 统计 */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="词库" value={books.length} icon={<BookOpen className="size-4" />} />
          <StatCard label="收录词条" value={stats.entries} icon={<Layers className="size-4" />} />
          <StatCard label="自定义字段" value={stats.fields} icon={<Pencil className="size-4" />} />
        </section>

        {/* 词库列表 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="t-h-20">书架</h2>
            <div className="flex items-center gap-3">
              {archivedCount > 0 ? (
                <Button size="sm" variant="tertiary" onClick={() => setShowArchived((value) => !value)}>
                  <Archive className="size-3.5" /> {showArchived ? "隐藏已归档" : `显示已归档（${archivedCount}）`}
                </Button>
              ) : null}
              <Link href="/skill" className="t-label-13 inline-flex items-center gap-1 text-blue-900 hover:underline">
                让 AI 帮你整理词表 <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
          {!hydrated ? (
            <div className="t-label-13 text-gray-800">正在载入数据…</div>
          ) : visibleBooks.length === 0 ? (
            <Card className="py-0">
              <EmptyState
                icon={<BookOpen className="size-4" />}
                title={books.length ? "词库都归档了" : "书架还是空的"}
                desc={
                  books.length
                    ? "归档不会删除内容与学习历史，打开显示开关就能恢复。"
                    : "新建一本开始写，或导入现成词表；想先看效果，就点「创建示例（10 词）」。"
                }
                action={
                  books.length ? (
                    <Button size="sm" onClick={() => setShowArchived(true)}>
                      显示已归档
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setNewOpen(true)}>
                        新建词库
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const b = addSampleBook();
                          router.push(`/book?id=${b.id}`);
                        }}
                      >
                        创建示例（10 词）
                      </Button>
                    </div>
                  )
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onOpen={() => router.push(`/book?id=${book.id}`)}
                  onExport={() => router.push(`/book/export?id=${book.id}`)}
                  onStudy={() => router.push(`/study?id=${book.id}`)}
                  onDelete={() => setDeleting(book)}
                  onPause={() => {
                    setBookStudyState(book.id, "paused");
                    toast.success(`已暂停「${book.name}」的学习`);
                  }}
                  onArchive={() => {
                    setBookStudyState(book.id, "archived");
                    toast.success(`已归档「${book.name}」`);
                  }}
                  onRestore={() => {
                    if (studyStateOf(book) === "archived") setRestoring(book);
                    else {
                      setBookStudyState(book.id, "active");
                      toast.success(`已恢复「${book.name}」的学习`);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>

        </main>

      <footer className="border-t border-gray-300 py-5 text-center">
        <span className="t-label-12 text-gray-700">词库随时可以导出 JSON 备份；开启跨端同步后，多台设备之间会自动对齐</span>
      </footer>

      {/* 新建词库 */}
      <Dialog open={newOpen} onOpenChange={setNewOpen} widthClass="max-w-lg">
        <DialogHeader title="新建词库" desc="挑一套排版底子先开工；字段之后随时能加、能删、能拖动排序。" />
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">词库名称</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：考研核心词汇 · Unit 1" autoFocus />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">字段模板</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCHEMA_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={cx(
                    "rounded-lg p-2.5 text-left transition-colors",
                    presetId === p.id ? "bg-blue-100 shadow-geist-border" : "bg-background-200 hover:bg-gray-100",
                  )}
                >
                  <div className="t-label-13 font-medium text-gray-1000">{p.name}</div>
                  <div className="t-label-12 mt-0.5 line-clamp-2 text-gray-800">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setNewOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              const b = createBook(name.trim() || "未命名词库", presetId);
              setNewOpen(false);
              setName("");
              toast.success("词库已创建");
              router.push(`/book?id=${b.id}`);
            }}
          >
            创建并开始
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 导入 */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(id) => {
          toast.success("导入完成，正在打开…");
          router.push(`/book?id=${id}`);
        }}
      />

      {/* 归档恢复：保留原计划或重置学习记录 */}
      <Dialog open={restoring !== null} onOpenChange={(v) => !v && setRestoring(null)}>
        <DialogHeader
          title="恢复词库学习"
          desc={restoring ? `「${restoring.name}」已归档。可以按原来的记忆进度继续，也可以把全部词条重置为未学。` : ""}
        />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            按原计划继续会保留到期时间与遗忘记录；重置后，所有词条都从新词开始，原来的复习进度不会保留。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRestoring(null)}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!restoring) return;
              setBookStudyState(restoring.id, "active");
              toast.success(`已按原计划恢复「${restoring.name}」`);
              setRestoring(null);
            }}
          >
            按原计划继续
          </Button>
          <Button
            variant="error"
            onClick={() => {
              if (!restoring) return;
              resetBookStudyProgress(restoring.id);
              setBookStudyState(restoring.id, "active");
              toast.success(`已重置「${restoring.name}」的学习记录`);
              setRestoring(null);
            }}
          >
            重置学习记录
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogHeader
          title="删除词库"
          desc={deleting ? `「${deleting.name}」里的 ${deleting.entries.length} 个词条会一起消失，且无法找回。先导出 JSON 备份更稳妥。` : ""}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={() => {
              if (deleting) {
                deleteBook(deleting.id);
                toast.success("词库已删除");
              }
              setDeleting(null);
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-gray-100 text-gray-900">{icon}</span>
      <div>
        <div className="t-h-24 tabular-nums">{value}</div>
        <div className="t-label-12 text-gray-800">{label}</div>
      </div>
    </Card>
  );
}


function BookCard({
  book,
  onOpen,
  onExport,
  onStudy,
  onDelete,
  onPause,
  onArchive,
  onRestore,
}: {
  book: Wordbook;
  onOpen: () => void;
  onExport: () => void;
  onStudy: () => void;
  onDelete: () => void;
  onPause: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const due = studyOverview(book).due;
  const state = studyStateOf(book);
  const inactive = state !== "active";
  return (
    <Card className="group relative flex cursor-pointer flex-col transition-shadow hover:shadow-geist-md" onClick={onOpen}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-[20px]">
          {book.meta?.coverEmoji || "📖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-h-16 truncate">{book.name}</div>
          <div className="t-label-12 mt-0.5 text-gray-800">
            {book.entries.length} 个词 · {book.schema.sections.length} 个字段 · 更新于 {timeAgo(book.updatedAt)}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="词库操作" size="sm" className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100 focus-visible:opacity-100">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={inactive ? onOpen : onStudy}>
                <Brain className="size-3.5" /> {inactive ? "打开词库" : "开始学习"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpen}>
                <BookOpen className="size-3.5" /> 打开
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport}>
                <FileDown className="size-3.5" /> 导出工作室
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  downloadText(`${slugify(book.name)}.json`, serializeBookDoc(book));
                  toast.success("已导出 JSON");
                }}
              >
                <FileJson className="size-3.5" /> 导出 JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  useAppStore.getState().duplicateBook(book.id);
                  toast.success("已复制成一册新的");
                }}
              >
                <Layers className="size-3.5" /> 复制
              </DropdownMenuItem>
              {state === "active" ? (
                <>
                  <DropdownMenuItem onSelect={onPause}>
                    <Pause className="size-3.5" /> 暂停学习
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onArchive}>
                    <Archive className="size-3.5" /> 归档
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={onRestore}>
                    <RotateCcw className="size-3.5" /> 恢复学习
                  </DropdownMenuItem>
                  {state === "paused" ? (
                    <DropdownMenuItem onSelect={onArchive}>
                      <Archive className="size-3.5" /> 归档
                    </DropdownMenuItem>
                  ) : null}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={onDelete}>
                <Trash2 className="size-3.5" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {book.description ? (
        <p className="t-label-13 mt-3 line-clamp-2 text-gray-800">{book.description}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1">
        {state === "paused" ? (
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-900">
            暂停{ due > 0 ? ` · 到期 ${due}` : "" }
          </span>
        ) : state === "archived" ? (
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-900">已归档</span>
        ) : null}
        {due > 0 ? (
          <span className="rounded bg-amber-700/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
            待复习 {due}
          </span>
        ) : null}
        {book.tags.slice(0, 4).map((t) => (
          <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-900">
            {t}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-700 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <Download className="size-3" /> 点击打开
        </span>
      </div>
    </Card>
  );
}
