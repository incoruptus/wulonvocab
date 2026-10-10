"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Star, Trash2, Copy, X } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Input, Select } from "@/components/ui/field";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, SegmentedControl } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import { cx, timeAgo } from "@/lib/utils";

type StatusFilter = "all" | "new" | "learning" | "mastered";
type SortMode = "order" | "az" | "recent";

export function EntryList({
  book,
  selectedId,
  onSelect,
}: {
  book: Wordbook;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const addEntry = useAppStore((s) => s.addEntry);
  const removeEntries = useAppStore((s) => s.removeEntries);
  const duplicateEntry = useAppStore((s) => s.duplicateEntry);
  const toggleStar = useAppStore((s) => s.toggleStar);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("order");
  const [starOnly, setStarOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of book.entries) for (const t of e.tags) set.add(t);
    return [...set].sort();
  }, [book.entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = book.entries.filter((e) => {
      if (starOnly && !e.starred) return false;
      if (status !== "all" && e.status !== status) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!q) return true;
      if (e.headword.toLowerCase().includes(q)) return true;
      const senses = e.values["senses"] as { translation?: string; definition?: string }[] | undefined;
      if (Array.isArray(senses)) {
        return senses.some(
          (s) => (s.translation ?? "").toLowerCase().includes(q) || (s.definition ?? "").toLowerCase().includes(q),
        );
      }
      return false;
    });
    if (sort === "az") list = [...list].sort((a, b) => a.headword.toLowerCase().localeCompare(b.headword.toLowerCase()));
    else if (sort === "recent") list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }, [book.entries, query, status, sort, starOnly, tagFilter]);

  const createEntry = (headword = "") => {
    const entry = addEntry(book.id, { headword });
    if (entry) onSelect(entry.id);
  };

  const exactMatch = book.entries.some((e) => e.headword.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-gray-300 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && !exactMatch) createEntry(query.trim());
            }}
            placeholder="搜索单词或释义…"
            className="h-8 pl-8 pr-7 text-[13px]"
          />
          {query ? (
            <button
              type="button"
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-1000"
              onClick={() => setQuery("")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <SegmentedControl<StatusFilter>
            size="sm"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: "全部" },
              { value: "new", label: "未学" },
              { value: "learning", label: "在学" },
              { value: "mastered", label: "已掌握" },
            ]}
            className="flex-1 justify-stretch"
          />
          <IconButton
            label="只看星标"
            size="sm"
            className={cx("size-7 shrink-0", starOnly && "bg-amber-700/20 text-amber-900")}
            onClick={() => setStarOnly((v) => !v)}
          >
            <Star className="size-3.5" fill={starOnly ? "currentColor" : "none"} />
          </IconButton>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="h-8 flex-1 text-[12px]">
            <option value="order">列表顺序</option>
            <option value="az">字母序 A→Z</option>
            <option value="recent">最近编辑</option>
          </Select>
          {allTags.length ? (
            <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-8 flex-1 text-[12px]">
              <option value="">全部标签</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {query.trim() && !exactMatch ? (
          <button
            type="button"
            onClick={() => createEntry(query.trim())}
            className="flex w-full items-center gap-2 border-b border-gray-300 px-3 py-2.5 text-left text-[13px] text-blue-900 transition-colors hover:bg-blue-100/60"
          >
            <Plus className="size-3.5" /> 创建「{query.trim()}」
          </button>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="size-4" />}
            title={book.entries.length === 0 ? "还没有词条" : "没有匹配的词条"}
            desc={book.entries.length === 0 ? "点击下方按钮新建，或使用「检索」从词典获取。" : "试试其他关键词或清除筛选。"}
            action={
              <Button size="sm" onClick={() => createEntry()}>
                <Plus className="size-3.5" /> 新建词条
              </Button>
            }
          />
        ) : (
          filtered.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              active={entry.id === selectedId}
              onSelect={() => onSelect(entry.id)}
              onStar={() => toggleStar(book.id, entry.id)}
              onDuplicate={() => duplicateEntry(book.id, entry.id)}
              onDelete={() => {
                removeEntries(book.id, [entry.id]);
                if (entry.id === selectedId) onSelect(null);
              }}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-300 p-2.5">
        <span className="t-label-12 text-gray-800">
          共 {book.entries.length} 词{filtered.length !== book.entries.length ? ` · 筛选 ${filtered.length}` : ""}
        </span>
        <Button size="sm" onClick={() => createEntry()}>
          <Plus className="size-3.5" /> 新建词条
        </Button>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  active,
  onSelect,
  onStar,
  onDuplicate,
  onDelete,
}: {
  entry: Entry;
  active: boolean;
  onSelect: () => void;
  onStar: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const phonetic = (entry.values["phonetic"] as { uk?: string; us?: string } | undefined) ?? {};
  const senses = entry.values["senses"] as { translation?: string }[] | undefined;
  const preview = senses?.[0]?.translation ?? "";
  const statusColor =
    entry.status === "mastered" ? "bg-green-700" : entry.status === "learning" ? "bg-amber-700" : "bg-gray-500";
  return (
    <div
      className={cx(
        "group relative flex cursor-pointer items-start gap-2 border-b border-gray-300/70 px-3 py-2.5 transition-colors",
        active ? "bg-blue-100/70" : "hover:bg-gray-100/80",
      )}
      onClick={onSelect}
    >
      <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", statusColor)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="t-h-14 truncate text-gray-1000">{entry.headword || "（未命名词条）"}</span>
          {phonetic.uk || phonetic.us ? (
            <span className="t-mono-12 shrink-0 text-gray-700">{phonetic.uk ?? phonetic.us}</span>
          ) : null}
          {entry.starred ? <Star className="size-3 shrink-0 self-center text-amber-700" fill="currentColor" /> : null}
        </div>
        {preview ? <div className="t-label-12 mt-0.5 line-clamp-1 text-gray-800">{preview}</div> : null}
        <div className="t-label-12 mt-1 flex items-center gap-1.5 text-gray-700">
          <span>{timeAgo(entry.updatedAt)}</span>
          {entry.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded bg-gray-100 px-1.5">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton
          label={entry.starred ? "取消星标" : "加星标"}
          size="sm"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
        >
          <Star className={cx("size-3", entry.starred && "text-amber-700")} fill={entry.starred ? "currentColor" : "none"} />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="更多操作" size="sm" className="size-6" onClick={(e) => e.stopPropagation()}>
              <span className="text-[14px] leading-none">⋯</span>
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{entry.headword}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                onDuplicate();
              }}
            >
              <Copy className="size-3.5" /> 复制词条
            </DropdownMenuItem>
            <DropdownMenuItem
              danger
              onSelect={() => {
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" /> 删除词条
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
