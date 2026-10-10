"use client";

import { useState } from "react";
import { Copy, ChevronLeft, Eye, EyeOff, MoreHorizontal, PenLine, Plus, Search, Sparkles, Star, Trash2 } from "lucide-react";
import type { Entry, SectionDef, SectionType, Wordbook } from "@/lib/types";
import { extraKeys, isValueEmpty, SECTION_TYPE_LIST, SECTIONS, sortSections } from "@/lib/sections";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Chip, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tip } from "@/components/ui/overlay";
import { SectionIcon } from "@/components/icon";
import { ValueEditor } from "@/components/value/ValueEditor";
import { TagsEditor } from "@/components/value/ValueEditor";
import { PosDatalist } from "@/components/value/SensesEditor";
import { EntryPreviewCard } from "@/components/book/EntryPreview";
import { cx, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

export function EntryEditor({
  book,
  entry,
  onDeleted,
  onRequestLookup,
  onBack,
}: {
  book: Wordbook;
  entry: Entry;
  onDeleted: () => void;
  onRequestLookup: () => void;
  /** 窄屏：返回词条列表 */
  onBack?: () => void;
}) {
  const updateEntry = useAppStore((s) => s.updateEntry);
  const setEntryValue = useAppStore((s) => s.setEntryValue);
  const removeEntries = useAppStore((s) => s.removeEntries);
  const duplicateEntry = useAppStore((s) => s.duplicateEntry);
  const promoteField = useAppStore((s) => s.promoteField);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteType, setPromoteType] = useState<SectionType>("text");
  /** 移动端：编辑 / 预览 双 Tab */
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  const sections = sortSections(book.schema.sections);
  const extras = extraKeys(entry.values, sections);

  const deleteKey = (key: string) => {
    const next = { ...entry.values };
    delete next[key];
    updateEntry(book.id, entry.id, { values: next });
  };

  const deleteEntry = () => {
    removeEntries(book.id, [entry.id]);
    onDeleted();
    toast.success("已删除词条");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PosDatalist />
      {/* 词条头部 */}
      <div className="space-y-3 border-b border-gray-300 px-4 py-4 lg:px-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="t-label-13 -ml-1 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000 lg:hidden"
          >
            <ChevronLeft className="size-3.5" /> 词条列表
          </button>
        ) : null}
        <div className="flex items-start gap-3">
          <input
            value={entry.headword}
            onChange={(e) => updateEntry(book.id, entry.id, { headword: e.target.value })}
            placeholder="输入单词…"
            className="t-h-24 min-w-0 flex-1 bg-transparent text-gray-1000 outline-none placeholder:text-gray-600"
            spellCheck={false}
            autoFocus={!entry.headword}
          />
          <div className="flex shrink-0 items-center gap-1.5 pt-1">
            <IconButton
              label={entry.starred ? "取消星标" : "加星标"}
              onClick={() => useAppStore.getState().toggleStar(book.id, entry.id)}
              size="sm"
              className={cx(entry.starred && "text-amber-700")}
            >
              <Star className="size-4" fill={entry.starred ? "currentColor" : "none"} />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={onRequestLookup}>
              <Search className="size-3.5" /> 检索<span className="hidden sm:inline">填充</span>
            </Button>
            <div className="hidden items-center gap-1.5 sm:flex">
              <IconButton label="复制词条" size="sm" onClick={() => duplicateEntry(book.id, entry.id)}>
                <Copy className="size-3.5" />
              </IconButton>
              <IconButton label="删除词条" size="sm" className="text-gray-800 hover:text-red-900" onClick={deleteEntry}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="更多操作" size="sm" className="sm:hidden">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    duplicateEntry(book.id, entry.id);
                    toast.success("已复制词条");
                  }}
                >
                  <Copy className="size-3.5" /> 复制词条
                </DropdownMenuItem>
                <DropdownMenuItem danger onSelect={deleteEntry}>
                  <Trash2 className="size-3.5" /> 删除词条
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl
            size="sm"
            value={entry.status}
            onValueChange={(v) => useAppStore.getState().setEntryStatus(book.id, entry.id, v)}
            options={[
              { value: "new", label: "未学" },
              { value: "learning", label: "在学" },
              { value: "mastered", label: "已掌握" },
            ]}
          />
          <div className="flex min-w-52 flex-1 items-center gap-2">
            <span className="t-label-12 shrink-0 text-gray-800">标签</span>
            <TagsEditor items={entry.tags} onChange={(tags) => updateEntry(book.id, entry.id, { tags })} placeholder="cet4、考研…" />
          </div>
        </div>
        <div className="t-label-12 hidden flex-wrap items-center gap-x-3 gap-y-1 text-gray-700 sm:flex">
          <span>创建于 {formatDateTime(entry.createdAt)}</span>
          <span>更新于 {formatDateTime(entry.updatedAt)}</span>
          {entry.source ? (
            <span>
              来源：{entry.source.kind === "lookup" ? "词典检索" : entry.source.kind === "import" ? "导入" : entry.source.kind === "ai" ? "AI 生成" : "手动"}
              {entry.source.label ? ` · ${entry.source.label}` : ""}
            </span>
          ) : null}
        </div>
        <div className="t-label-12 text-gray-700 sm:hidden">更新于 {formatDateTime(entry.updatedAt)}</div>
      </div>

      {/* 动态字段（移动端：编辑 / 预览 双 Tab） */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div className={cx("space-y-6 px-4 py-5 pb-28 lg:px-5 lg:pb-6", mobileTab === "edit" ? "" : "hidden lg:block")}>
          {sections.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-4" />}
              title="还没有字段"
              desc="去「字段设计」挑几个字段，或一键套用模板（牛津词典风 / 极简记忆卡…），马上就能写。"
            />
          ) : null}
          {sections.map((section) => (
            <SectionForm
              key={section.id}
              section={section}
              entry={entry}
              onChange={(v) => setEntryValue(book.id, entry.id, section.key, v)}
            />
          ))}

          {extras.length ? (
            <div className="rounded-xl bg-background-200 p-3 shadow-geist-border">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5 text-amber-800" />
                <span className="t-h-14">未定义字段</span>
                <span className="t-label-12 text-gray-800">
                  这些内容在数据里，但还没进字段表——「提升为字段」后即可出现在排版里。
                </span>
              </div>
              <div className="space-y-1.5">
                {extras.map((key) => (
                  <div key={key} className="flex items-center gap-2 rounded-lg bg-background-100 p-2 shadow-geist-border">
                    <span className="t-mono-13 w-36 shrink-0 truncate text-gray-900">{key}</span>
                    <span className="t-label-12 min-w-0 flex-1 truncate text-gray-700">
                      {renderExtraPreview(entry.values[key])}
                    </span>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => {
                        setPromoting(key);
                        setPromoteType("text");
                      }}
                    >
                      <Plus className="size-3.5" /> 提升为字段
                    </Button>
                    <IconButton label="删除该键" size="sm" className="text-gray-800 hover:text-red-900" onClick={() => deleteKey(key)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 预览 Tab（移动端）：与导出一致 */}
        <div className={cx("px-4 py-5 pb-28 lg:hidden", mobileTab === "preview" ? "" : "hidden")}>
          <EntryPreviewCard book={book} entry={entry} className="mx-auto max-w-[340px]" />
          <p className="t-label-12 mt-3 text-center text-gray-700">与导出排版一致 · 纸张与样式可在导出工作室调整</p>
        </div>
      </div>

      {/* 提升字段对话框 */}
      <Dialog open={promoting !== null} onOpenChange={(v) => !v && setPromoting(null)}>
        <DialogHeader
          title="提升为字段"
          desc={`「${promoting ?? ""}」将加入字段表，出现在编辑器与所有导出卡片中。`}
        />
        <DialogBody className="space-y-3">
          <div className="t-label-13 text-gray-900">字段类型</div>
          <div className="grid grid-cols-2 gap-1.5">
            {SECTION_TYPE_LIST.map((t) => {
              const def = SECTIONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPromoteType(t)}
                  className={cx(
                    "flex items-center gap-2 rounded-lg p-2 text-left text-[13px] transition-colors",
                    promoteType === t ? "bg-blue-100 text-blue-1000 shadow-geist-border" : "bg-background-200 hover:bg-gray-100",
                  )}
                >
                  <SectionIcon name={def.icon} className="size-3.5 shrink-0 text-gray-900" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{def.label}</span>
                    <span className="block truncate text-[11px] text-gray-700">{def.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPromoting(null)}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!promoting) return;
              promoteField(book.id, promoting, promoteType);
              setPromoting(null);
              toast.success(`已将「${promoting}」提升为字段`);
            }}
          >
            确认提升
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 移动端：编辑 / 预览 切换 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-gray-300 bg-background-100 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {(
          [
            { id: "edit", label: "编辑", icon: PenLine },
            { id: "preview", label: "预览", icon: Eye },
          ] as const
        ).map((t) => {
          const active = mobileTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setMobileTab(t.id)}
              aria-pressed={active}
              className={cx(
                "flex h-12 items-center justify-center gap-1.5 text-[13px] transition-colors",
                active ? "bg-gray-100 font-medium text-gray-1000" : "text-gray-800 hover:bg-gray-100/60",
              )}
            >
              <Icon className={cx("size-4", active ? "text-blue-900" : "")} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function renderExtraPreview(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("；");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function SectionForm({
  section,
  entry,
  onChange,
}: {
  section: SectionDef;
  entry: Entry;
  onChange: (v: unknown) => void;
}) {
  const def = SECTIONS[section.type];
  const value = entry.values[section.key];
  const empty = isValueEmpty(section.type, value);
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <SectionIcon name={section.icon} className="size-3.5 text-gray-900" />
        <h3 className="t-h-14 text-gray-1000">{section.label}</h3>
        <Badge variant="gray" size="sm">
          {def.label}
        </Badge>
        {!section.visible ? (
          <Tip tip="该字段当前设置为「不在导出中显示」，可在字段设计或导出工作室中打开">
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-900">
              <EyeOff className="size-3" /> 导出隐藏
            </span>
          </Tip>
        ) : null}
        {empty ? <span className="t-label-12 text-gray-700">未填写</span> : null}
        <span className="ml-auto">
          <Chip color="gray" className="!h-5 !text-[11px]">
            {section.key}
          </Chip>
        </span>
      </header>
      <ValueEditor section={section} value={value} onChange={onChange} />
    </section>
  );
}
