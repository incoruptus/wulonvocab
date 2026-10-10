"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight, BookOpen, Brain, Download, FileDown, FileJson, Layers, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Upload,
} from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { SCHEMA_PRESETS } from "@/lib/presets";
import { serializeBookDoc } from "@/lib/serializers";
import { studyOverview } from "@/lib/study/queue";
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
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [presetId, setPresetId] = useState("oxford");
  const [deleting, setDeleting] = useState<Wordbook | null>(null);

  const stats = useMemo(() => {
    const entries = books.reduce((acc, b) => acc + b.entries.length, 0);
    const fields = books.reduce((acc, b) => acc + b.schema.sections.length, 0);
    return { entries, fields };
  }, [books]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 pb-24 pt-6 sm:space-y-10 sm:px-6 sm:py-8">
                {/* 词库页头 */}
        <section className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="t-h-24">我的词库</h1>
            <p className="t-label-13 mt-1 text-gray-800">每本词书都有自己的字段与进度——接着写，接着背，或者排成一本可以打印的书。</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> 新建词库
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> 导入 JSON / CSV
            </Button>
            <Button
              variant="tertiary"
              onClick={() => {
                const b = addSampleBook();
                toast.success("示例已建好：3 个词、10 个字段，直接看效果");
                router.push(`/book?id=${b.id}`);
              }}
            >
              <Sparkles className="size-4" /> 创建示例（3 词）
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
          <div className="flex items-center justify-between">
            <h2 className="t-h-20">书架</h2>
            <Link href="/skill" className="t-label-13 inline-flex items-center gap-1 text-blue-900 hover:underline">
              让 AI 帮你整理词表 <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {!hydrated ? (
            <div className="t-label-13 text-gray-800">正在载入数据…</div>
          ) : books.length === 0 ? (
            <Card className="py-0">
              <EmptyState
                icon={<BookOpen className="size-4" />}
                title="书架还是空的"
                desc="新建一本开始写，或导入现成词表；想先看效果，就点「创建示例（3 词）」——完整词卡长什么样，一眼就知道。"
                action={
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
                      创建示例（3 词）
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onOpen={() => router.push(`/book?id=${book.id}`)}
                  onExport={() => router.push(`/book/export?id=${book.id}`)}
                  onStudy={() => router.push(`/study?id=${book.id}`)}
                  onDelete={() => setDeleting(book)}
                />
              ))}
            </div>
          )}
        </section>

        </main>

      <footer className="border-t border-gray-300 py-5 text-center">
        <span className="t-label-12 text-gray-700">词库与配置只住在你的设备里 · 随时导出 JSON 带走</span>
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

      {/* 删除确认 */}
      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogHeader
          title="删除词库"
          desc={deleting ? `「${deleting.name}」里的 ${deleting.entries.length} 个词条会一起消失，且无法找回——先导出 JSON 备份更稳妥。` : ""}
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
}: {
  book: Wordbook;
  onOpen: () => void;
  onExport: () => void;
  onStudy: () => void;
  onDelete: () => void;
}) {
  const due = studyOverview(book).due;
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
              <IconButton label="词库操作" size="sm" className="opacity-0 transition-opacity group-hover:opacity-100">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onStudy}>
                <Brain className="size-3.5" /> 开始学习
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
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-700 opacity-0 transition-opacity group-hover:opacity-100">
          <Download className="size-3" /> 点击打开
        </span>
      </div>
    </Card>
  );
}
