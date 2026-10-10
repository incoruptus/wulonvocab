"use client";

import { useMemo, useRef, useState } from "react";
import { CheckSquare, Copy, Download, Plus, Search, Star, StarOff, Tag, Trash2, X } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Input, Select, Checkbox } from "@/components/ui/field";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, SegmentedControl } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import { SwipeableRow } from "@/components/book/SwipeableRow";
import { cx, timeAgo } from "@/lib/utils";

type StatusFilter = "all" | "new" | "learning" | "mastered";
type SortMode = "order" | "az" | "recent";

export interface EntryListProps {
  book: Wordbook;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 多选模式 */
  selecting: boolean;
  selection: Set<string>;
  onToggleSelect: (id: string, opts: { shift: boolean }, filteredIds: string[]) => void;
  onEnterSelect: (id: string) => void;
  onExitSelect: () => void;
  onSelectAllFiltered: (ids: string[]) => void;
  onRequestBatchStatus: (status: "new" | "learning" | "mastered") => void;
  onRequestBatchTags: () => void;
  onRequestBatchStar: (starred: boolean) => void;
  onRequestBatchDelete: () => void;
  onRequestExportSelected: () => void;
  /** 单条：删除（带撤销）/ 星标 */
  onQuickDelete: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
}

export function EntryList(props: EntryListProps) {
  const { book, selectedId, onSelect } = props;
  const addEntry = useAppStore((s) => s.addEntry);
  const duplicateEntry = useAppStore((s) => s.duplicateEntry);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("order");
  const [starOnly, setStarOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [openRowId, setOpenRowId] = useState<string | null>(null);

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

  const filteredIds = useMemo(() => filtered.map((e) => e.id), [filtered]);

  const createEntry = (headword = "") => {
    const entry = addEntry(book.id, { headword });
    if (entry) onSelect(entry.id);
  };

  const exactMatch = book.entries.some((e) => e.headword.toLowerCase() === query.trim().toLowerCase());
  const hiddenSelected = props.selecting ? [...props.selection].filter((id) => !filteredIds.includes(id)).length : 0;

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
            grow
          />
          <IconButton
            label="只看星标"
            size="sm"
            className={cx("shrink-0", starOnly && "bg-amber-700/20 text-amber-900")}
            onClick={() => setStarOnly((v) => !v)}
          >
            <Star className="size-3.5" fill={starOnly ? "currentColor" : "none"} />
          </IconButton>
          <IconButton
            label={props.selecting ? "退出多选" : "多选"}
            size="sm"
            className={cx("shrink-0", props.selecting && "bg-blue-100 text-blue-1000")}
            onClick={() => {
              if (props.selecting) props.onExitSelect();
              else props.onEnterSelect(selectedId ?? filteredIds[0] ?? "");
            }}
          >
            <CheckSquare className="size-3.5" />
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

      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-thin"
        onScroll={() => {
          if (openRowId) setOpenRowId(null);
        }}
      >
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
            desc={
              book.entries.length === 0
                ? "先新建一个，或用「检索」从词典取词；整批词表直接走「导入」。"
                : "换个关键词，或清掉状态 / 标签筛选再看看。"
            }
            action={
              <Button size="sm" onClick={() => createEntry()}>
                <Plus className="size-3.5" /> 新建词条
              </Button>
            }
          />
        ) : (
          filtered.map((entry) => (
            <SwipeableRow
              key={entry.id}
              open={openRowId === entry.id}
              onOpenChange={(open) => setOpenRowId(open ? entry.id : null)}
              disabled={props.selecting}
              leading={{ label: "选择", icon: CheckSquare, onAction: () => props.onEnterSelect(entry.id) }}
              trailing={[
                { label: "星标", icon: Star, tone: "amber", onAction: () => props.onStar(entry) },
                { label: "删除", icon: Trash2, tone: "red", onAction: () => props.onQuickDelete(entry) },
              ]}
            >
              <EntryRow
                entry={entry}
                active={entry.id === selectedId && !props.selecting}
                selecting={props.selecting}
                checked={props.selection.has(entry.id)}
                onOpen={() => onSelect(entry.id)}
                onToggle={(shift) => props.onToggleSelect(entry.id, { shift }, filteredIds)}
                onStar={() => props.onStar(entry)}
                onDuplicate={() => duplicateEntry(book.id, entry.id)}
                onDelete={() => props.onQuickDelete(entry)}
              />
            </SwipeableRow>
          ))
        )}
      </div>

      {props.selecting ? (
        <BatchBar
          count={props.selection.size}
          hiddenCount={hiddenSelected}
          onExit={props.onExitSelect}
          onSelectAll={() => props.onSelectAllFiltered(filteredIds)}
          onStatus={props.onRequestBatchStatus}
          onTags={props.onRequestBatchTags}
          onStar={() => props.onRequestBatchStar(true)}
          onUnstar={() => props.onRequestBatchStar(false)}
          onDelete={props.onRequestBatchDelete}
          onExport={props.onRequestExportSelected}
          filteredCount={filteredIds.length}
        />
      ) : (
        <div className="flex items-center justify-between border-t border-gray-300 p-2.5">
          <span className="t-label-12 text-gray-800">
            共 {book.entries.length} 词{filtered.length !== book.entries.length ? ` · 筛选 ${filtered.length}` : ""}
          </span>
          <Button size="sm" onClick={() => createEntry()}>
            <Plus className="size-3.5" /> 新建词条
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- 多选操作栏 ---------------- */

function BatchBar({
  count,
  hiddenCount,
  filteredCount,
  onExit,
  onSelectAll,
  onStatus,
  onTags,
  onStar,
  onUnstar,
  onDelete,
  onExport,
}: {
  count: number;
  hiddenCount: number;
  filteredCount: number;
  onExit: () => void;
  onSelectAll: () => void;
  onStatus: (s: "new" | "learning" | "mastered") => void;
  onTags: () => void;
  onStar: () => void;
  onUnstar: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-gray-300 bg-background-100 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2">
        <IconButton label="退出多选" size="sm" onClick={onExit}>
          <X className="size-3.5" />
        </IconButton>
        <span className="t-label-13 tabular-nums text-gray-1000">已选 {count} 项</span>
        {hiddenCount > 0 ? <span className="t-label-12 text-amber-900">（{hiddenCount} 项被筛选隐藏）</span> : null}
        <Button variant="tertiary" size="sm" className="ml-auto" onClick={onSelectAll}>
          全选（{filteredCount}）
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              状态
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>批量设置学习状态</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onStatus("new")}>未学（清除学习进度）</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStatus("learning")}>在学</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStatus("mastered")}>已掌握</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="sm" onClick={onTags}>
          <Tag className="size-3.5" /> 标签
        </Button>
        <IconButton label="批量星标" size="sm" onClick={onStar}>
          <Star className="size-3.5" />
        </IconButton>
        <IconButton label="批量取消星标" size="sm" onClick={onUnstar}>
          <StarOff className="size-3.5" />
        </IconButton>
        <IconButton label="导出所选 JSON" size="sm" onClick={onExport}>
          <Download className="size-3.5" />
        </IconButton>
        <IconButton label="批量删除" size="sm" className="text-red-900 hover:bg-red-700/10" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

/* ---------------- 单行 ---------------- */

function EntryRow({
  entry,
  active,
  selecting,
  checked,
  onOpen,
  onToggle,
  onStar,
  onDuplicate,
  onDelete,
}: {
  entry: Entry;
  active: boolean;
  selecting: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggle: (shift: boolean) => void;
  onStar: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const phonetic = (entry.values["phonetic"] as { uk?: string; us?: string } | undefined) ?? {};
  const senses = entry.values["senses"] as { translation?: string }[] | undefined;
  const preview = senses?.[0]?.translation ?? "";
  const statusColor =
    entry.status === "mastered" ? "bg-green-700" : entry.status === "learning" ? "bg-amber-700" : "bg-gray-500";

  return (
    <div
      className={cx(
        "group relative flex cursor-pointer items-start gap-2 border-b border-gray-300/70 px-3 py-2.5 transition-colors",
        checked ? "bg-blue-100/70" : active ? "bg-blue-100/70" : "hover:bg-gray-100/80",
      )}
      onClick={(e) => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        if (selecting) onToggle(e.shiftKey);
        else onOpen();
      }}
      onPointerDown={() => {
        if (selecting) return;
        longPressFired.current = false;
        longPressRef.current = setTimeout(() => {
          longPressFired.current = true;
          onToggle(false);
        }, 500);
      }}
      onPointerUp={() => {
        if (longPressRef.current) clearTimeout(longPressRef.current);
      }}
      onPointerLeave={() => {
        if (longPressRef.current) clearTimeout(longPressRef.current);
      }}
    >
      {/* 选择框 / 状态点 */}
      <span className="relative mt-1 grid size-4 shrink-0 place-items-center">
        {selecting ? (
          <Checkbox checked={checked} onCheckedChange={() => onToggle(false)} aria-label={`选择 ${entry.headword}`} />
        ) : (
          <>
            <span className={cx("size-1.5 rounded-full transition-opacity group-hover:opacity-0", statusColor)} />
            <span className="absolute inset-0 hidden items-center justify-center lg:flex">
              <Checkbox
                checked={false}
                onCheckedChange={() => onToggle(false)}
                aria-label={`选择 ${entry.headword}`}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </span>
          </>
        )}
      </span>
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
      {!selecting ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton
            label={entry.starred ? "取消星标" : "加星标"}
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
          >
            <Star className={cx("size-3", entry.starred && "text-amber-700")} fill={entry.starred ? "currentColor" : "none"} />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="更多操作" size="xs" onClick={(e) => e.stopPropagation()}>
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
      ) : null}
    </div>
  );
}
