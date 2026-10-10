"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight, BookOpen, Download, FileDown, FileJson, Layers, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Upload,
} from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { SCHEMA_PRESETS } from "@/lib/presets";
import { serializeBookDoc } from "@/lib/serializers";
import { useAppStore } from "@/lib/store";
import { TopNav } from "@/components/app/TopNav";
import { ImportDialog } from "@/components/import/ImportDialog";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { cx, downloadText, slugify, timeAgo } from "@/lib/utils";

export default function DashboardPage() {
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
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-6 py-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-gray-300 bg-gradient-to-br from-background-100 to-background-200 p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-[0.12]" style={{ background: "radial-gradient(circle, #0068d6, transparent 70%)" }} />
          <div className="pointer-events-none absolute -bottom-28 right-24 size-64 rounded-full opacity-[0.10]" style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
          <Badge variant="blue" size="sm">
            <Sparkles className="size-3" /> 动态字段驱动的单词本工坊
          </Badge>
          <h1 className="t-h-32 mt-4 max-w-2xl text-gray-1000">把单词，做成一本真正精美的书。</h1>
          <p className="t-copy-14 mt-3 max-w-xl text-gray-900">
            字段自由组合（词性释义 / 词族 / 词性变换 / 联想 / 例句 / 情景标签…），JSON 一键导入自动排版，
            A4 · B5 · A5 导出即印，装订成册。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> 新建词库
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> 导入 JSON / CSV
            </Button>
            <Button
              size="lg"
              variant="tertiary"
              onClick={() => {
                const b = addSampleBook();
                toast.success("已创建示例词库");
                router.push(`/book/${b.id}`);
              }}
            >
              <Sparkles className="size-4" /> 创建示例词库
            </Button>
          </div>
        </section>

        {/* 统计 */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="词库" value={books.length} icon={<BookOpen className="size-4" />} />
          <StatCard label="词条总数" value={stats.entries} icon={<Layers className="size-4" />} />
          <StatCard label="字段总数" value={stats.fields} icon={<Pencil className="size-4" />} />
        </section>

        {/* 词库列表 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="t-h-20">我的词库</h2>
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
                title="还没有词库"
                desc="新建一个空词库、导入 JSON/CSV 词表，或先创建示例感受完整流程。"
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
                        router.push(`/book/${b.id}`);
                      }}
                    >
                      创建示例
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
                  onOpen={() => router.push(`/book/${book.id}`)}
                  onExport={() => router.push(`/book/${book.id}/export`)}
                  onDelete={() => setDeleting(book)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 特性 */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Layers className="size-4" />}
            title="动态字段管理"
            desc="词性下分释义与用法、词族、词性变换、联想、例句、情景标签……任意增删字段、拖动排序，实时预览排版效果。"
          />
          <FeatureCard
            icon={<Upload className="size-4" />}
            title="导入即排版"
            desc="WulonVocab / ECDICT / OALD 结构自动识别，AI 生成的 JSON 直接导入；未知字段不丢失，可一键提升为正式字段。"
          />
          <FeatureCard
            icon={<FileDown className="size-4" />}
            title="打印级导出"
            desc="A4 / B5 / A5 / 16开 / 32开，矢量 PDF（文字可搜索）与 300DPI PNG，双栏词典版式、镜像装订边距、封面与索引。"
          />
        </section>

        {/* Skill 横幅 */}
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-300 bg-background-200 p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-gray-1000 text-background-100">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="t-h-16">把需求交给 AI，得到可直接导入的词表</div>
            <p className="t-label-13 mt-0.5 text-gray-800">
              「帮我整理 50 个雅思写作高频词，带词族、搭配和真题例句」——AI 按 WulonVocab Skill 规范输出 JSON，导入即可排版导出。
            </p>
          </div>
          <Link href="/skill">
            <Button variant="secondary">
              查看 Skill <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-300 py-5 text-center">
        <span className="t-label-12 text-gray-700">WulonVocab · 本地优先 · 数据保存在你的浏览器 IndexedDB 中</span>
      </footer>

      {/* 新建词库 */}
      <Dialog open={newOpen} onOpenChange={setNewOpen} widthClass="max-w-lg">
        <DialogHeader title="新建词库" desc="选择一套字段模板开始，之后可随时增删字段。" />
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
              router.push(`/book/${b.id}`);
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
          router.push(`/book/${id}`);
        }}
      />

      {/* 删除确认 */}
      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogHeader
          title="删除词库"
          desc={deleting ? `「${deleting.name}」包含 ${deleting.entries.length} 个词条，删除后不可恢复。` : ""}
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

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card>
      <span className="grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-900">{icon}</span>
      <div className="t-h-16 mt-3">{title}</div>
      <p className="t-label-13 mt-1.5 leading-relaxed text-gray-800">{desc}</p>
    </Card>
  );
}

function BookCard({
  book,
  onOpen,
  onExport,
  onDelete,
}: {
  book: Wordbook;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="group relative flex cursor-pointer flex-col transition-shadow hover:shadow-geist-md" onClick={onOpen}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-[20px]">
          {book.meta?.coverEmoji || "📖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-h-16 truncate">{book.name}</div>
          <div className="t-label-12 mt-0.5 text-gray-800">
            {book.entries.length} 词 · {book.schema.sections.length} 字段 · {timeAgo(book.updatedAt)}
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
                  toast.success("已复制词库");
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
