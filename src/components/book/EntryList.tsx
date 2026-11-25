"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ, ArrowUpAZ, CalendarClock, CheckSquare, ChevronDown, ChevronRight, Copy, Download, Filter, FolderOpen, Layers, LockKeyhole, Merge,
  PenLine, Plus, RotateCcw, Save, Search, Sparkles, Star, StarOff, Tag, Trash2, X,
} from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Field, Input, Checkbox, SwitchRow } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { SwipeableRow } from "@/components/book/SwipeableRow";
import { cx, timeAgo } from "@/lib/utils";
import { contextTagFields, GROUP_DIM_OPTIONS, groupEntries } from "@/lib/study/group";
import { SORT_DIM_OPTIONS, sortEntries } from "@/lib/study/sort";
import { formatDue, memoryStateLabel, r30Of } from "@/lib/study/engine";
import { studyConfigOf } from "@/lib/study/queue";
import { leechInfoOf } from "@/lib/study/leech";
import type { MasteryIndex } from "@/lib/study/mastery";
import { MasteryEvidence } from "@/components/study/MasteryEvidence";
import { useReviewMastery } from "@/components/study/useReviewMastery";
import { DEFAULT_VIEW_PREFS, type LeechFilter, type StatusFilter } from "@/lib/viewPrefs";
import { useBookViewPrefs } from "./useBookViewPrefs";
import { batchGroups, type BatchIntent, type BatchSelection } from "@/lib/study/batch";

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
  /** 批量：把所选合并为一个（≥2 项；字段取并集） */
  onRequestBatchMerge: () => void;
  onRequestExportSelected: () => void;
  /** 单条：删除（带撤销）/ 星标 */
  onQuickDelete: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
  /** 批量：检索选中的词条并补全空缺字段 */
  onRequestBatchLookup: () => void;
  /** 添加新词并自动匹配词典内容 */
  onAddLookup: (word?: string) => void;
}

export function EntryList(props: EntryListProps) {
  const { book, selectedId, onSelect } = props;
  const router = useRouter();
  const addEntry = useAppStore((s) => s.addEntry);
  const duplicateEntry = useAppStore((s) => s.duplicateEntry);
  const setEntrySuspension = useAppStore((s) => s.setEntrySuspension);
  const { index: masteryIndex } = useReviewMastery();
  const { state: viewState, ready, updatePrefs, toggleCollapsed, saveView, applyView, deleteView } = useBookViewPrefs(book.id);
  const prefs = viewState.prefs;
  const [query, setQuery] = useState("");
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [batchGroupIndex, setBatchGroupIndex] = useState(0);
  const [batchKey, setBatchKey] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of book.entries) for (const t of e.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [book.entries]);
  const contextFields = useMemo(() => contextTagFields(book), [book]);
  const leechThreshold = studyConfigOf(book).leechThreshold;
  const availableBatches = useMemo(() => batchGroups(book), [book]);
  const batchGroup = availableBatches[Math.min(batchGroupIndex, Math.max(0, availableBatches.length - 1))];
  const selectedBatch: BatchSelection = {
    dimension: batchGroup.dimension,
    key: batchGroup.dimension === "random" ? "" : batchKey || batchGroup.options[0]?.value || "",
    contextKey: batchGroup.contextKey,
    size: 8,
  };
  const startBatch = (intent: BatchIntent) => {
    const params = new URLSearchParams({
      id: book.id,
      intent,
      batch: selectedBatch.dimension,
      size: String(selectedBatch.size),
    });
    if (selectedBatch.key) params.set("key", selectedBatch.key);
    if (selectedBatch.contextKey) params.set("contextKey", selectedBatch.contextKey);
    router.push(`/study?${params.toString()}`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = book.entries.filter((e) => {
      if (prefs.starOnly && !e.starred) return false;
      if (prefs.status !== "all" && e.status !== prefs.status) return false;
      if (prefs.tag && !e.tags.includes(prefs.tag)) return false;
      const leech = leechInfoOf(e, now, leechThreshold);
      if (prefs.leechFilter === "warning" && leech.level !== "warning") return false;
      if (prefs.leechFilter === "leech" && leech.lapses < leech.threshold) return false;
      if (prefs.leechFilter === "suspended" && leech.level !== "suspended") return false;
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
    return sortEntries(list, prefs.sort, prefs.dir, { seed: prefs.shuffleSeed });
  }, [book.entries, query, prefs, now, leechThreshold]);

  const grouped = useMemo(
    () =>
      groupEntries(filtered, book, prefs.group, {
        tagMode: prefs.tagMode,
        contextKey: prefs.contextKey,
        showEmptyGroups: prefs.showEmptyGroups,
      }),
    [filtered, book, prefs.group, prefs.tagMode, prefs.contextKey, prefs.showEmptyGroups],
  );
  const filteredIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const visibleGroupCount = grouped.filter((group) => group.entries.length > 0).length;
  const statusCounts = useMemo(
    () => ({
      all: book.entries.length,
      new: book.entries.filter((entry) => entry.status === "new").length,
      learning: book.entries.filter((entry) => entry.status === "learning").length,
      mastered: book.entries.filter((entry) => entry.status === "mastered").length,
    }),
    [book.entries],
  );

  const createEntry = (headword = "") => {
    const entry = addEntry(book.id, { headword });
    if (entry) onSelect(entry.id);
  };

  const exactMatch = book.entries.some((e) => e.headword.toLowerCase() === query.trim().toLowerCase());
  const activeFilterCount = (prefs.status !== "all" ? 1 : 0) + (prefs.leechFilter !== "all" ? 1 : 0) + (prefs.starOnly ? 1 : 0) + (prefs.tag ? 1 : 0);
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
              if (e.key === "Enter" && query.trim() && !exactMatch) props.onAddLookup(query.trim());
            }}
            placeholder="搜索单词或释义…"
            className="h-8 pl-8 pr-16 text-[13px]"
          />
          {query ? (
            <button
              type="button"
              aria-label="清空搜索"
              className="absolute right-11 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-1000"
              onClick={() => setQuery("")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <IconButton
                label="筛选与视图"
                size="sm"
                className={cx(
                  "absolute right-1.5 top-1/2 -translate-y-1/2",
                  activeFilterCount > 0 && "bg-blue-100 text-blue-1000",
                )}
              >
                <Filter className="size-3.5" />
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-blue-800 px-0.5 text-[9px] font-medium leading-none text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </IconButton>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              collisionPadding={12}
              className="flex max-h-[min(38rem,calc(100dvh-5rem))] w-[min(23rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)] flex-col overflow-hidden p-0"
            >
              <div className="shrink-0 px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="t-h-16 text-gray-1000">视图与筛选</div>
                    <p className="t-label-12 mt-0.5 text-gray-700">保存当前的筛选、排序与分组。</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-1 t-label-12 text-gray-700">
                    <LockKeyhole className="size-3" /> 仅本机
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 scroll-thin">
                <section className="space-y-3">
                  <FilterSectionHeading title="已存视图" meta={`${viewState.savedViews.length} 个`} />
                  {viewState.savedViews.length ? (
                    <div className="space-y-1.5">
                      {viewState.savedViews.map((view) => (
                        <div key={view.id} className="flex items-center rounded-lg border border-gray-300 bg-background-100">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-l-lg px-3 py-2 text-left transition-colors hover:bg-gray-100"
                            onClick={() => applyView(view.id)}
                            title={`应用视图：${view.name}`}
                          >
                            <FolderOpen className="size-3.5 shrink-0 text-gray-700" />
                            <span className="t-label-13 min-w-0 flex-1 truncate text-gray-1000">{view.name}</span>
                          </button>
                          <IconButton label={`删除视图：${view.name}`} size="xs" className="mr-1" onClick={() => deleteView(view.id)}>
                            <X className="size-3" />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-background-200 px-3 py-2.5 t-label-12 text-gray-700">还没有保存视图。调好下面的条件后，可以一键保存。</div>
                  )}
                  {saveViewOpen ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={viewName}
                        onChange={(e) => setViewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && viewName.trim()) {
                            saveView(viewName);
                            setViewName("");
                            setSaveViewOpen(false);
                          }
                        }}
                        placeholder="视图名称"
                        aria-label="视图名称"
                        className="h-9 min-w-0 flex-1 text-[13px]"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={!viewName.trim()}
                        onClick={() => {
                          saveView(viewName);
                          setViewName("");
                          setSaveViewOpen(false);
                        }}
                      >
                        保存
                      </Button>
                      <IconButton label="取消保存视图" size="sm" onClick={() => setSaveViewOpen(false)}>
                        <X className="size-3.5" />
                      </IconButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="secondary" className="min-w-0 flex-1" disabled={!ready} onClick={() => setSaveViewOpen(true)}>
                        <Save className="size-3.5" /> 保存当前视图
                      </Button>
                      <IconButton
                        label="重置视图"
                        size="sm"
                        disabled={!ready}
                        onClick={() => updatePrefs({ ...DEFAULT_VIEW_PREFS, collapsed: [] })}
                      >
                        <RotateCcw className="size-3.5" />
                      </IconButton>
                    </div>
                  )}
                </section>

                <section className="space-y-3 border-t border-gray-300 pt-4">
                  <FilterSectionHeading
                    title="筛选"
                    action={activeFilterCount > 0 ? (
                      <button
                        type="button"
                        className="t-label-12 text-blue-900 hover:underline"
                        onClick={() => updatePrefs({ status: "all", leechFilter: "all", starOnly: false, tag: "" })}
                      >
                        清除筛选
                      </button>
                    ) : undefined}
                  />
                  <div className="space-y-1.5">
                    <div className="t-label-13 font-medium text-gray-900">学习状态</div>
                    <StatusFilterGrid value={prefs.status} onChange={(status) => updatePrefs({ status })} counts={statusCounts} />
                  </div>
                  <div className="rounded-lg bg-background-200 px-3">
                    <SwitchRow label="只看星标" checked={prefs.starOnly} disabled={!ready} onCheckedChange={(starOnly) => updatePrefs({ starOnly })} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="顽固词状态">
                      <Select
                        value={prefs.leechFilter}
                        onValueChange={(leechFilter) => updatePrefs({ leechFilter: leechFilter as LeechFilter })}
                        options={[
                          { value: "all", label: "全部状态" },
                          { value: "warning", label: "易忘提醒" },
                          { value: "leech", label: "顽固词" },
                          { value: "suspended", label: "搁置中" },
                        ]}
                      />
                    </Field>
                    {allTags.length ? (
                      <Field label="词条标签">
                        <Select
                          value={prefs.tag}
                          onValueChange={(tag) => updatePrefs({ tag })}
                          options={[{ value: "", label: "全部标签" }, ...allTags.map((t) => ({ value: t, label: t }))]}
                        />
                      </Field>
                    ) : null}
                  </div>
                </section>
                <section className="space-y-3 border-t border-gray-300 pt-4">
                  <FilterSectionHeading title="排序" />
                  <div className="flex items-end gap-2">
                    <Field label="排序依据" className="min-w-0 flex-1">
                      <Select
                        value={prefs.sort}
                        onValueChange={(value) =>
                          updatePrefs({
                            sort: value as (typeof SORT_DIM_OPTIONS)[number]["value"],
                            ...(value === "shuffle" ? { shuffleSeed: Date.now() >>> 0 } : {}),
                          })
                        }
                        options={SORT_DIM_OPTIONS}
                      />
                    </Field>
                    <IconButton
                      label={prefs.dir === "asc" ? "当前升序，切换为降序" : "当前降序，切换为升序"}
                      disabled={!ready || prefs.sort === "shuffle"}
                      onClick={() => updatePrefs({ dir: prefs.dir === "asc" ? "desc" : "asc" })}
                      className="mb-0.5"
                    >
                      {prefs.dir === "asc" ? <ArrowDownAZ className="size-4" /> : <ArrowUpAZ className="size-4" />}
                    </IconButton>
                  </div>
                </section>

                <section className="space-y-3 border-t border-gray-300 pt-4">
                  <FilterSectionHeading title="分组" />
                  <Field label="分组依据">
                    <Select
                      value={prefs.group}
                      onValueChange={(value) => updatePrefs({ group: value as (typeof GROUP_DIM_OPTIONS)[number]["value"] })}
                      options={GROUP_DIM_OPTIONS}
                    />
                  </Field>
                  {prefs.group !== "none" ? (
                    <div className="space-y-3 rounded-lg bg-background-200 p-3">
                      {prefs.group === "tags" || prefs.group === "contextTags" ? (
                        <Field label="标签归属">
                          <Select
                            value={prefs.tagMode}
                            onValueChange={(tagMode) => updatePrefs({ tagMode: tagMode as "first" | "all" })}
                            options={[
                              { value: "first", label: "归入首个标签" },
                              { value: "all", label: "出现在所有标签" },
                            ]}
                          />
                        </Field>
                      ) : null}
                      {prefs.group === "contextTags" && contextFields.length > 1 ? (
                        <Field label="情景标签字段">
                          <Select
                            value={prefs.contextKey || contextFields[0]?.key || ""}
                            onValueChange={(contextKey) => updatePrefs({ contextKey })}
                            options={contextFields.map((field) => ({ value: field.key, label: field.label }))}
                          />
                        </Field>
                      ) : null}
                      <SwitchRow
                        label="显示空分区"
                        checked={prefs.showEmptyGroups}
                        onCheckedChange={(showEmptyGroups) => updatePrefs({ showEmptyGroups })}
                      />
                    </div>
                  ) : (
                    <p className="t-label-12 text-gray-700">选择标签、首字母或学习状态等依据，列表就会按分区呈现。</p>
                  )}
                </section>

                <section className="space-y-3 border-t border-gray-300 pt-4">
                  <FilterSectionHeading title="学习批次" meta="5–10 词" />
                  <p className="t-label-12 text-gray-700">从主题、来源、频率或随机词中单独取一批，不改变列表分区。</p>
                  <Field label="批次依据">
                    <Select
                      value={String(Math.min(batchGroupIndex, availableBatches.length - 1))}
                      onValueChange={(value) => {
                        setBatchGroupIndex(Number(value));
                        setBatchKey("");
                      }}
                      options={availableBatches.map((group, index) => ({
                        value: String(index),
                        label: group.dimension === "contextTags" ? `${group.label}（${group.options.length} 组）` : group.label,
                      }))}
                    />
                  </Field>
                  {batchGroup.dimension !== "random" ? (
                    <Field label={batchGroup.dimension === "contextTags" ? "主题 / 情景" : batchGroup.label}>
                      <Select
                        value={selectedBatch.key}
                        onValueChange={setBatchKey}
                        options={batchGroup.options.map((option) => ({ value: option.value, label: `${option.label} · ${option.count} 词` }))}
                      />
                    </Field>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startBatch("new")}>
                      <Layers className="size-3.5" /> 学这批新词
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => startBatch("review")}>
                      <CalendarClock className="size-3.5" /> 复习这批
                    </Button>
                    <Button size="sm" variant="secondary" className="col-span-2" onClick={() => startBatch("cram")}>
                      <Sparkles className="size-3.5" /> 自由练习这批
                    </Button>
                  </div>
                  <p className="t-label-12 text-gray-700">自由练习每词只出现一次，不写入复习计划，也不计入每日目标。</p>
                </section>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-300 bg-background-100 px-4 py-3">
                <p className="t-label-12 leading-5 text-gray-700">批量编辑会保留当前筛选结果，可在底部工具栏统一改状态、标签、星标或合并。</p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-thin"
        onScroll={() => {
          if (openRowKey) setOpenRowKey(null);
        }}
      >
        {query.trim() && !exactMatch ? (
          <button
            type="button"
            onClick={() => props.onAddLookup(query.trim())}
            className="flex w-full items-center gap-2 border-b border-gray-300 px-3 py-2.5 text-left text-[13px] text-blue-900 transition-colors hover:bg-blue-100/60"
          >
            <Search className="size-3.5" /> 添加并匹配「{query.trim()}」
          </button>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="size-4" />}
            title={book.entries.length === 0 ? "还没有词条" : "没有匹配的词条"}
            desc={
              book.entries.length === 0
                ? "用「添加并匹配」查词典并入库，或手动新建后填写内容；整批词表走「导入」。"
                : "换个关键词，或清掉状态 / 标签筛选再看看。"
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => props.onAddLookup()}>
                  <Search className="size-3.5" /> 添加并匹配
                </Button>
                <Button size="sm" variant="secondary" onClick={() => createEntry()}>
                  <Plus className="size-3.5" /> 手动新建
                </Button>
              </div>
            }
          />
        ) : (
          grouped.map((group) => {
            const collapsed = prefs.collapsed.includes(group.key) && group.entries.length > 0;
            return (
              <section key={group.key}>
                {prefs.group !== "none" ? (
                  <button
                    type="button"
                    className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-gray-300 bg-background-100/95 px-3 py-1.5 text-left backdrop-blur"
                    onClick={() => toggleCollapsed(group.key)}
                    aria-expanded={!collapsed}
                  >
                    {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    <span className="t-label-13 font-medium text-gray-900">{group.label}</span>
                    <span className="t-mono-12 text-gray-700">{group.entries.length}</span>
                  </button>
                ) : null}
                {!collapsed &&
                  group.entries.map((entry) => {
                    const rowKey = `${group.key}:${entry.id}`;
                    return (
                      <SwipeableRow
                        key={rowKey}
                        open={openRowKey === rowKey}
                        onOpenChange={(open) => setOpenRowKey(open ? rowKey : null)}
                        disabled={props.selecting}
                        leading={{ label: "选择", icon: CheckSquare, onAction: () => props.onEnterSelect(entry.id) }}
                        trailing={[
                          { label: "星标", icon: Star, tone: "amber", onAction: () => props.onStar(entry) },
                          { label: "删除", icon: Trash2, tone: "red", onAction: () => props.onQuickDelete(entry) },
                        ]}
                      >
                        <EntryRow
                          entry={entry}
                          retention={studyConfigOf(book).retention}
                          leechThreshold={studyConfigOf(book).leechThreshold}
                          masteryIndex={masteryIndex}
                          now={now}
                          active={entry.id === selectedId && !props.selecting}
                          selecting={props.selecting}
                          checked={props.selection.has(entry.id)}
                          onOpen={() => onSelect(entry.id)}
                          onToggle={(shift) => props.onToggleSelect(entry.id, { shift }, filteredIds)}
                          onStar={() => props.onStar(entry)}
                          onDuplicate={() => duplicateEntry(book.id, entry.id)}
                          onDelete={() => props.onQuickDelete(entry)}
                          onSuspend={(days) => setEntrySuspension(book.id, entry.id, days)}
                          onEdit={() => onSelect(entry.id)}
                        />
                      </SwipeableRow>
                    );
                  })}
              </section>
            );
          })
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
          onMerge={props.onRequestBatchMerge}
          onExport={props.onRequestExportSelected}
          onLookup={props.onRequestBatchLookup}
          filteredCount={filteredIds.length}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-300 p-2.5">
          <span className="t-label-12 text-gray-800">
            共 {book.entries.length} 词{filtered.length !== book.entries.length ? ` · 筛选 ${filtered.length}` : ""}
            {prefs.group !== "none" && visibleGroupCount > 0 ? ` · ${visibleGroupCount} 组` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => props.onAddLookup()}>
              <Search className="size-3.5" /> 添加并匹配
            </Button>
            <Button size="sm" variant="secondary" onClick={() => createEntry()}>
              <Plus className="size-3.5" /> 手动新建
            </Button>
            <Button
              size="sm"
              variant={props.selecting ? "default" : "secondary"}
              onClick={() => {
                if (props.selecting) props.onExitSelect();
                else props.onEnterSelect(selectedId ?? filteredIds[0] ?? "");
              }}
            >
              <CheckSquare className="size-3.5" /> {props.selecting ? "退出多选" : "批量编辑"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 筛选弹层辅助 ---------------- */

function FilterSectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="t-label-13 font-medium text-gray-1000">{title}</span>
        {meta ? <span className="t-label-12 text-gray-700">{meta}</span> : null}
      </div>
      {action}
    </div>
  );
}

function StatusFilterGrid({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "new", label: "未学" },
    { value: "learning", label: "在学" },
    { value: "mastered", label: "稳固（当前）" },
  ];
  return (
    <div role="radiogroup" aria-label="学习状态" className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex h-11 items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors",
              selected
                ? "border-blue-600 bg-blue-100/70 text-blue-1000 shadow-geist-xs"
                : "border-gray-300 bg-background-100 text-gray-900 hover:bg-gray-100",
            )}
          >
            <span className="t-label-13 min-w-0 truncate">{option.label}</span>
            <span className="t-mono-12 shrink-0 opacity-70">{counts[option.value]}</span>
          </button>
        );
      })}
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
  onMerge,
  onExport,
  onLookup,
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
  onMerge: () => void;
  onExport: () => void;
  onLookup: () => void;
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
            <DropdownMenuItem onSelect={() => onStatus("mastered")}>稳固（当前）</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="sm" onClick={onTags}>
          <Tag className="size-3.5" /> 标签
        </Button>
        <IconButton label="批量检索补全" size="sm" onClick={onLookup}>
          <Sparkles className="size-3.5" />
        </IconButton>
        <IconButton label="批量星标" size="sm" onClick={onStar}>
          <Star className="size-3.5" />
        </IconButton>
        <IconButton label="批量取消星标" size="sm" onClick={onUnstar}>
          <StarOff className="size-3.5" />
        </IconButton>
        <IconButton label="导出所选 JSON" size="sm" onClick={onExport}>
          <Download className="size-3.5" />
        </IconButton>
        <IconButton label="合并所选词条" size="sm" onClick={onMerge} disabled={count < 2}>
          <Merge className="size-3.5" />
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
  retention,
  leechThreshold,
  masteryIndex,
  now,
  active,
  selecting,
  checked,
  onOpen,
  onToggle,
  onStar,
  onDuplicate,
  onDelete,
  onSuspend,
  onEdit,
}: {
  entry: Entry;
  retention: number;
  leechThreshold: number;
  masteryIndex: MasteryIndex;
  now: number;
  active: boolean;
  selecting: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggle: (shift: boolean) => void;
  onStar: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSuspend: (days: 7 | 30 | null) => void;
  onEdit: () => void;
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const phonetic = (entry.values["phonetic"] as { uk?: string; us?: string } | undefined) ?? {};
  const senses = entry.values["senses"] as { translation?: string }[] | undefined;
  const preview = senses?.[0]?.translation ?? "";
  const statusColor =
    entry.status === "mastered" ? "bg-green-700" : entry.status === "learning" ? "bg-amber-700" : "bg-gray-500";
  const r30 = now > 0 ? r30Of(entry.srs, now, retention) : null;
  const memoryLabel = memoryStateLabel(entry.srs);
  const leech = leechInfoOf(entry, now, leechThreshold);

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
                className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100"
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
        {leech.level !== "none" ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                "rounded px-1.5 py-0.5 t-label-12",
                leech.level === "leech" ? "bg-red-700/10 text-red-900" : "bg-amber-700/10 text-amber-900",
              )}
            >
              {leech.level === "suspended"
                ? `搁置至 ${new Date(leech.until!).toLocaleDateString("zh-CN")}`
                : leech.level === "leech"
                  ? `顽固词 · ${leech.lapses} 次`
                  : `易忘 · ${leech.lapses}/${leech.threshold}`}
            </span>
          </div>
        ) : null}
        <MasteryEvidence entryId={entry.id} index={masteryIndex} />
        {r30 !== null ? (
          <div className="t-label-12 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-700">
            <span className={memoryLabel === "稳固（当前）" ? "text-green-900" : undefined}>{memoryLabel}</span>
            <span>30 天后约 {Math.round(r30 * 100)}%</span>
            <span>下次复习 {formatDue(entry.srs?.due)}</span>
          </div>
        ) : null}
      </div>
      {!selecting ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
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
              {leech.level !== "none" ? (
                <>
                  <DropdownMenuItem onSelect={onEdit}>
                    <PenLine className="size-3.5" /> 改卡
                  </DropdownMenuItem>
                  {leech.level === "suspended" ? (
                    <DropdownMenuItem onSelect={() => onSuspend(null)}>
                      <RotateCcw className="size-3.5" /> 解除搁置
                    </DropdownMenuItem>
                  ) : leech.level === "leech" ? (
                    <>
                      <DropdownMenuItem onSelect={() => onSuspend(7)}>
                        <CalendarClock className="size-3.5" /> 搁置 7 天
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onSuspend(30)}>
                        <CalendarClock className="size-3.5" /> 搁置 30 天
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </>
              ) : null}
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
