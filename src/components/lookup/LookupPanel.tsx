"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Search, Sparkles, XCircle } from "lucide-react";
import type { Entry, LookupResult, Wordbook } from "@/lib/types";
import { makeEntry } from "@/lib/presets";
import { draftToValues } from "@/lib/importer";
import { isValueEmpty } from "@/lib/sections";
import { buildValueDiff, summarizeValue, type ValueDiffRow } from "@/lib/lookup/diff";
import { runLookup } from "@/lib/lookup";
import { runBatchLookup, type BatchLookupItem } from "@/lib/lookup/batch";
import { peekLocalSuggestions } from "@/lib/lookup/localdict";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Textarea } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cx } from "@/lib/utils";

const now = () => Date.now();

export function LookupPanel({
  open,
  onOpenChange,
  book,
  targetEntry,
  onApplied,
  initialTab,
  fillEntryIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book: Wordbook;
  targetEntry: Entry | null;
  onApplied: (entryId: string) => void;
  /** 打开时的默认页签（批量栏「批量检索」会带 fill + 选中集） */
  initialTab?: "single" | "batch" | "fill";
  /** 补全范围（词条 id）；缺省时扫描全书的空缺释义词条 */
  fillEntryIds?: string[];
}) {
  const sources = useAppStore((s) => s.lookupSources);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const [word, setWord] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [resultsBySource, setResultsBySource] = useState<Record<string, LookupResult>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [fromCache, setFromCache] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchFailed, setBatchFailed] = useState<string[]>([]);
  const [fillRunning, setFillRunning] = useState(false);
  const [fillProgress, setFillProgress] = useState({ done: 0, total: 0 });
  const [fillItems, setFillItems] = useState<BatchLookupItem[] | null>(null);
  const [fillChecked, setFillChecked] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const activeSources = useMemo(() => sources.filter((s) => s.enabled && !excluded.has(s.id)), [sources, excluded]);

  /** 补全候选：指定词条集优先，否则扫描「空缺释义」的词条 */
  const fillCandidates = useMemo(() => {
    if (fillEntryIds?.length) {
      const ids = new Set(fillEntryIds);
      return book.entries.filter((e) => ids.has(e.id));
    }
    return book.entries.filter((e) => isValueEmpty("senses", e.values["senses"]));
  }, [book.entries, fillEntryIds]);

  // 输入建议：当前词库前缀 + 已加载本地词库前缀（不触发网络）
  const suggestions = useMemo(() => {
    const q = word.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: string[] = [];
    for (const e of book.entries) {
      if (out.length >= 6) break;
      if (e.headword.toLowerCase().startsWith(q) && e.headword.toLowerCase() !== q) out.push(e.headword);
    }
    for (const d of dictionaries) {
      for (const s of peekLocalSuggestions(d.id, q, 6)) {
        if (out.length >= 10) break;
        if (!out.includes(s)) out.push(s);
      }
    }
    return out.slice(0, 10);
  }, [word, book.entries, dictionaries]);

  // 渐进渲染：按数据源占位，谁先返回谁先显示；命中缓存则瞬间全出
  /** 检索请求代次：新请求作废旧请求的异步回调（防串词/后到覆盖先到） */
  const lookupReqRef = useRef(0);
  const doLookup = async (override?: string, opts?: { refresh?: boolean }) => {
    const w = (override ?? word ?? "").trim() || (targetEntry?.headword ?? "").trim();
    if (!w) {
      toast.error("请输入要检索的单词");
      return;
    }
    const req = ++lookupReqRef.current;
    setLoading(true);
    setResultsBySource({});
    setFromCache(false);
    setPending(new Set(activeSources.map((s) => s.id)));
    try {
      const res = await runLookup(w, activeSources, book.schema, {
        localDictIds: dictionaries.map((d) => d.id),
        bypassCache: opts?.refresh,
        onPartial: (r) => {
          if (lookupReqRef.current !== req) return;
          setResultsBySource((prev) => ({ ...prev, [r.sourceId]: r }));
          setPending((prev) => {
            if (!prev.has(r.sourceId)) return prev;
            const next = new Set(prev);
            next.delete(r.sourceId);
            return next;
          });
        },
      });
      if (lookupReqRef.current !== req) return;
      if (res.some((r) => r.fromCache)) setFromCache(true);
      if (res.length > 0 && res.every((r) => !r.ok)) toast.error("所有数据源均未返回结果");
    } finally {
      if (lookupReqRef.current === req) {
        setLoading(false);
        setPending(new Set());
      }
    }
  };

  /** 应用前的字段级差异确认（默认勾选「新增」，已有内容需手动勾选才覆盖） */
  const [diff, setDiff] = useState<{
    entry: Entry;
    label: string;
    tags: string[];
    full: Record<string, unknown>;
    rows: ValueDiffRow[];
    checked: Set<string>;
  } | null>(null);

  const openDiff = (result: LookupResult, entry: Entry) => {
    if (!result.draft) return;
    // 归一化后的完整映射（overwrite:true 仅用于取「新值形态」，是否写入由勾选决定）
    const { values: full } = draftToValues(result.draft.values, book.schema, entry.values, { overwrite: true });
    const rows = buildValueDiff(entry.values, full, book.schema.sections);
    if (!rows.length) {
      toast.info("没有可写入的字段（内容已是最新）");
      return;
    }
    setDiff({
      entry,
      label: result.sourceLabel,
      tags: result.draft.suggestedTags ?? [],
      full,
      rows,
      checked: new Set(rows.filter((r) => r.kind === "new").map((r) => r.key)),
    });
  };

  const applyDiff = () => {
    if (!diff) return;
    const values = { ...diff.entry.values };
    for (const row of diff.rows) {
      if (diff.checked.has(row.key)) values[row.key] = diff.full[row.key];
    }
    const tags = [...new Set([...diff.entry.tags, ...diff.tags])];
    useAppStore.getState().updateEntry(book.id, diff.entry.id, {
      values,
      tags,
      source: { kind: "lookup", label: diff.label, at: now() },
    });
    toast.success(`已写入 ${diff.checked.size} 个字段`, { description: `词条「${diff.entry.headword}」，来源：${diff.label}` });
    onApplied(diff.entry.id);
    setDiff(null);
  };

  const applyResult = (result: LookupResult, entry: Entry) => {
    openDiff(result, entry);
  };

  const createFromResult = (result: LookupResult) => {
    if (!result.draft) return;
    const { values } = draftToValues(result.draft.values, book.schema, {}, { keepExtras: false });
    const entry = makeEntry({
      headword: result.word,
      tags: result.draft.suggestedTags ?? [],
      values,
      source: { kind: "lookup", label: result.sourceLabel, at: now() },
    });
    useAppStore.getState().appendEntries(book.id, [entry]);
    toast.success(`已新建词条「${result.word}」`);
    onApplied(entry.id);
  };

  const runBatch = async () => {
    const words = [...new Set(batchText.split(/[\n,，;；\s]+/).map((w) => w.trim()).filter(Boolean))];
    if (!words.length) {
      toast.error("请输入单词列表（每行一个）");
      return;
    }
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: words.length });
    setBatchFailed([]);
    const controller = new AbortController();
    abortRef.current = controller;
    const items = await runBatchLookup(
      words.map((w) => ({ key: w, word: w })),
      {
        sources: activeSources,
        schema: book.schema,
        localDictIds: dictionaries.map((d) => d.id),
        signal: controller.signal,
        onProgress: (done, total) => setBatchProgress({ done, total }),
      },
    );
    const newEntries: Entry[] = [];
    const failed: string[] = [];
    for (const it of items) {
      if (it.best?.draft) {
        const { values } = draftToValues(it.best.draft.values, book.schema, {}, {});
        newEntries.push(
          makeEntry({
            headword: it.word,
            tags: it.best.draft.suggestedTags ?? [],
            values,
            source: { kind: "lookup", label: it.best.sourceLabel, at: now() },
          }),
        );
      } else {
        failed.push(it.word);
      }
    }
    if (newEntries.length) {
      useAppStore.getState().appendEntries(book.id, newEntries);
      toast.success(
        controller.signal.aborted
          ? `已停止：新增 ${newEntries.length} 条（其余未处理）`
          : `批量检索完成：新增 ${newEntries.length} 条${failed.length ? `，${failed.length} 条未获取到内容` : ""}`,
      );
      if (newEntries[0]) onApplied(newEntries[0].id);
    } else {
      toast.error(controller.signal.aborted ? "已停止，没有新增词条" : "批量检索没有获得结果");
    }
    setBatchFailed(failed);
    setBatchRunning(false);
    abortRef.current = null;
  };

  /** 补全空缺：批量检索 → diff 预览 → 应用（只补空缺、不覆盖） */
  const runFill = async () => {
    const tasks = fillCandidates.map((e) => ({ key: e.id, word: e.headword }));
    if (!tasks.length) {
      toast.error("没有可补全的词条");
      return;
    }
    setFillRunning(true);
    setFillItems(null);
    setFillChecked(new Set());
    setFillProgress({ done: 0, total: tasks.length });
    const controller = new AbortController();
    abortRef.current = controller;
    const items = await runBatchLookup(tasks, {
      sources: activeSources,
      schema: book.schema,
      localDictIds: dictionaries.map((d) => d.id),
      signal: controller.signal,
      onProgress: (done, total) => setFillProgress({ done, total }),
    });
    setFillItems(items);
    setFillChecked(new Set(items.filter((it) => it.best).map((it) => it.key)));
    setFillRunning(false);
    abortRef.current = null;
  };

  const applyFill = () => {
    const chosen = (fillItems ?? []).filter((it) => it.best && fillChecked.has(it.key));
    if (!chosen.length) {
      toast.error("没有勾选可应用的词条");
      return;
    }
    let fieldsTotal = 0;
    let firstId: string | null = null;
    let applied = 0;
    for (const it of chosen) {
      const entry = book.entries.find((e) => e.id === it.key);
      if (!entry || !it.best?.draft) continue;
      const { values, added } = draftToValues(it.best.draft.values, book.schema, entry.values, { overwrite: false });
      const tags = [...new Set([...entry.tags, ...(it.best.draft.suggestedTags ?? [])])];
      useAppStore.getState().updateEntry(book.id, entry.id, {
        values,
        tags,
        source: { kind: "lookup", label: it.best.sourceLabel, at: now() },
      });
      fieldsTotal += added.length;
      applied += 1;
      firstId ??= entry.id;
    }
    toast.success(`已补全 ${applied} 个词条（${fieldsTotal} 个字段）`, { description: "只补空缺，未覆盖已有内容" });
    if (firstId) onApplied(firstId);
    setFillItems(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-3xl">
      <DialogHeader
        title="词典检索"
        desc={
          targetEntry
            ? `检索结果将填入当前词条「${targetEntry.headword || "（未命名）"}」，只补空缺、不覆盖已填内容`
            : "输入单词，从词典数据源获取结构化词卡"
        }
      />
      <DialogBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-label-12 text-gray-800">数据源</span>
          {sources.map((s) => {
            const on = s.enabled && !excluded.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                className={cx(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  on ? "border-blue-600/40 bg-blue-100 text-blue-900" : "border-gray-400 text-gray-700 hover:bg-gray-100",
                )}
                title={s.enabled ? "" : "该数据源未启用（到设置中开启）"}
              >
                {s.label}
                {s.kind === "localdict" ? `（${dictionaries.length} 部词库）` : ""}
              </button>
            );
          })}
        </div>

        {/* 应用前差异确认（B4）：勾选要写入的字段；已有内容默认不勾 */}
        {diff ? (
          <div className="space-y-3 rounded-lg bg-background-200 p-3 shadow-geist-border">
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-label-13 font-medium text-gray-1000">
                确认应用：{diff.entry.headword || "当前词条"}
              </span>
              <span className="t-label-12 text-gray-700">勾选要写入的字段（已有内容默认不勾，来源：{diff.label}）</span>
              <Button size="sm" variant="tertiary" className="ml-auto" onClick={() => setDiff(null)}>
                取消
              </Button>
            </div>
            <ul className="scroll-thin max-h-[38vh] space-y-1.5 overflow-y-auto">
              {diff.rows.map((row) => (
                <li key={row.key} className="flex items-start gap-2.5 rounded-md bg-background-100 px-2.5 py-2 shadow-geist-border">
                  <Checkbox
                    checked={diff.checked.has(row.key)}
                    onCheckedChange={(v) =>
                      setDiff((d) => {
                        if (!d) return d;
                        const next = new Set(d.checked);
                        if (v) next.add(row.key);
                        else next.delete(row.key);
                        return { ...d, checked: next };
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="t-label-13 text-gray-1000">{row.label}</span>
                      <Badge variant={row.kind === "new" ? "blue" : "amber"} size="sm">
                        {row.kind === "new" ? "新增" : "覆盖"}
                      </Badge>
                    </div>
                    <div className="t-label-12 min-w-0 text-gray-700">
                      {row.kind === "conflict" ? (
                        <>
                          <span className="line-through opacity-60">{summarizeValue(row.type, row.current)}</span>
                          {" → "}
                        </>
                      ) : null}
                      <span className="text-gray-900">{summarizeValue(row.type, row.incoming)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Button size="sm" disabled={diff.checked.size === 0} onClick={applyDiff}>
              应用选中 {diff.checked.size} 个字段
            </Button>
          </div>
        ) : null}

        <Tabs defaultValue={initialTab ?? "single"}>
          <TabsList>
            <TabsTrigger value="single">单词检索</TabsTrigger>
            <TabsTrigger value="batch">批量导入单词表</TabsTrigger>
            <TabsTrigger value="fill">补全空缺</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && doLookup()}
                placeholder={targetEntry?.headword ? `默认：${targetEntry.headword}` : "例如 abrupt"}
                autoFocus
              />
              <Button onClick={() => doLookup()} loading={loading}>
                <Search className="size-4" /> 检索
              </Button>
            </div>
            {word.trim().length >= 2 && suggestions.length ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 8).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setWord(s);
                      void doLookup(s);
                    }}
                    className="t-mono-12 rounded-full bg-gray-100 px-2 py-0.5 text-gray-900 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            {loading && Object.keys(resultsBySource).length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-800">
                <Loader2 className="size-4 animate-spin" /> 正在查询 {activeSources.length} 个数据源
              </div>
            ) : null}

            {!loading && Object.keys(resultsBySource).length === 0 ? (
              <EmptyState
                icon={<Search className="size-4" />}
                title="等待检索"
                desc="结果会按数据源分组展示；应用到词条时只填充空缺字段。30 天内的结果会留在本机，再查更快。"
              />
            ) : null}

            {fromCache ? (
              <div className="flex items-center gap-2 rounded-lg bg-background-200 px-3 py-2 shadow-geist-border">
                <Badge variant="gray" size="sm">
                  缓存
                </Badge>
                <span className="t-label-12 text-gray-800">来自本地缓存（30 天内）</span>
                <Button variant="secondary" size="sm" className="ml-auto" onClick={() => doLookup(undefined, { refresh: true })}>
                  重新检索
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              {activeSources.map((src) => {
                const r = resultsBySource[src.id];
                if (r) {
                  return (
                    <ResultCard
                      key={src.id}
                      result={r}
                      targetEntry={targetEntry}
                      onApply={(entry) => applyResult(r, entry)}
                      onCreate={() => createFromResult(r)}
                    />
                  );
                }
                if (pending.has(src.id)) {
                  return <ResultPendingCard key={src.id} label={src.label} />;
                }
                return null;
              })}
            </div>
          </TabsContent>

          <TabsContent value="batch" className="mt-3 space-y-3">
            <Textarea
              rows={6}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={"每行一个单词，或用空格 / 逗号分隔：\nabandon\nresilient\ncomprehensive"}
              className="text-[13px]"
            />
            <div className="flex items-center gap-2">
              <Button onClick={runBatch} loading={batchRunning}>
                <Sparkles className="size-4" /> 开始批量检索
              </Button>
              {batchRunning ? (
                <>
                  <span className="t-mono-12 text-gray-800">
                    {batchProgress.done}/{batchProgress.total}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                    中止
                  </Button>
                </>
              ) : (
                <span className="t-label-12 text-gray-700">每个单词取第一个成功的数据源，自动新建词条并套用字段结构</span>
              )}
            </div>
            {batchRunning ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-700 transition-[width]"
                  style={{ width: `${Math.round((batchProgress.done / Math.max(1, batchProgress.total)) * 100)}%` }}
                />
              </div>
            ) : null}
            {batchFailed.length && !batchRunning ? (
              <div className="rounded-lg bg-amber-700/10 p-2.5 text-[12px] text-amber-900">
                未获取到内容的词：{batchFailed.join("、")}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="fill" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="t-label-13 text-gray-900">
                {fillEntryIds?.length
                  ? `对所选 ${fillCandidates.length} 个词条批量检索`
                  : `扫描到 ${fillCandidates.length} 个空缺释义的词条`}
              </span>
              <span className="t-label-12 text-gray-700">只补空缺字段、不覆盖已有内容；结果可逐条勾选</span>
            </div>

            {!fillItems ? (
              <>
                {fillCandidates.length ? (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-background-200 p-2 scroll-thin">
                    {fillCandidates.slice(0, 200).map((e) => (
                      <div key={e.id} className="flex items-center gap-2 rounded-md bg-background-100 px-2.5 py-1.5 shadow-geist-border">
                        <span className="t-mono-13 shrink-0 font-medium text-gray-1000">{e.headword}</span>
                        <span className="t-label-12 min-w-0 flex-1 truncate text-gray-700">尚无释义，待补全</span>
                      </div>
                    ))}
                    {fillCandidates.length > 200 ? (
                      <div className="t-label-12 px-2 py-1 text-gray-700">还有 {fillCandidates.length - 200} 个未显示（不影响处理）</div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    icon={<CheckCircle2 className="size-4" />}
                    title="没有空缺"
                    desc="所有词条的释义都已填写；也可以多选词条后，从列表底部的「批量检索补全」发起。"
                  />
                )}
                <div className="flex items-center gap-2">
                  <Button onClick={runFill} loading={fillRunning} disabled={!fillCandidates.length}>
                    <Sparkles className="size-4" /> 开始补全{fillCandidates.length ? `（${fillCandidates.length}）` : ""}
                  </Button>
                  {fillRunning ? (
                    <>
                      <span className="t-mono-12 text-gray-800">
                        {fillProgress.done}/{fillProgress.total}
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                        中止
                      </Button>
                    </>
                  ) : null}
                </div>
                {fillRunning ? (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-blue-700 transition-[width]"
                      style={{ width: `${Math.round((fillProgress.done / Math.max(1, fillProgress.total)) * 100)}%` }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="green" size="sm">
                    可补全 {fillItems.filter((it) => it.best).length}
                  </Badge>
                  {fillItems.some((it) => !it.best) ? (
                    <Badge variant="amber" size="sm">
                      未匹配 {fillItems.filter((it) => !it.best).length}
                    </Badge>
                  ) : null}
                  <Button variant="tertiary" size="sm" onClick={runFill}>
                    重新检索
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-background-200 p-2 scroll-thin">
                  {fillItems.map((it) => (
                    <label
                      key={it.key}
                      className={cx(
                        "flex items-center gap-2 rounded-md bg-background-100 px-2.5 py-1.5 shadow-geist-border",
                        it.best ? "cursor-pointer" : "opacity-65",
                      )}
                    >
                      <Checkbox
                        disabled={!it.best}
                        checked={fillChecked.has(it.key)}
                        onCheckedChange={() =>
                          setFillChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(it.key)) next.delete(it.key);
                            else next.add(it.key);
                            return next;
                          })
                        }
                      />
                      <span className="t-mono-13 shrink-0 font-medium text-gray-1000">{it.word}</span>
                      {it.best ? (
                        <span className="t-label-12 min-w-0 flex-1 truncate text-gray-900">{draftGloss(it.best.draft?.values)}</span>
                      ) : (
                        <span className="t-label-12 min-w-0 flex-1 truncate text-amber-900">{it.error}</span>
                      )}
                      {it.best ? <span className="t-label-12 hidden shrink-0 text-gray-700 sm:inline">{it.best.sourceLabel}</span> : null}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={applyFill} disabled={fillChecked.size === 0}>
                    应用 {fillChecked.size} 个词条（只补空缺）
                  </Button>
                  <Button variant="tertiary" onClick={() => setFillItems(null)}>
                    返回重选
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ---------------- 结果卡片 ---------------- */

/** 从 draft values 提取一行摘要（补全预览用） */
function draftGloss(values: Record<string, unknown> | undefined): string {
  const senses = values?.["senses"];
  if (!Array.isArray(senses)) return "";
  const first = senses[0] as { pos?: string; translation?: string } | undefined;
  return first ? [first.pos, first.translation].filter(Boolean).join(" ").slice(0, 80) : "";
}

/** 检索中占位（渐进渲染：按源先到先显示） */
function ResultPendingCard({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background-200 p-3 opacity-70 shadow-geist-border">
      <Loader2 className="size-4 shrink-0 animate-spin text-gray-800" />
      <span className="t-h-14">{label}</span>
      <span className="t-label-12 text-gray-700">检索中…</span>
    </div>
  );
}

function ResultCard({
  result,
  targetEntry,
  onApply,
  onCreate,
}: {
  result: LookupResult;
  targetEntry: Entry | null;
  onApply: (entry: Entry) => void;
  onCreate: () => void;
}) {
  const draft = result.draft;
  const values = draft?.values ?? {};
  const fieldsCount = Object.keys(values).length;

  // 中文译法预览（来自 senses 的 translation）
  const zhTranslations = (() => {
    const senses = values["senses"];
    if (!Array.isArray(senses)) return [] as string[];
    return (senses as { translation?: string }[])
      .map((s) => (s.translation ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
  })();
  const exampleCount = Array.isArray(values["senses"])
    ? (values["senses"] as { examples?: unknown[] }[]).reduce((acc, s) => acc + (s.examples?.length ?? 0), 0)
    : Array.isArray(values["examples"])
      ? (values["examples"] as unknown[]).length
      : 0;
  const transformCount = Array.isArray(values["transforms"]) ? (values["transforms"] as unknown[]).length : 0;
  const familyCount = Array.isArray(values["family"]) ? (values["family"] as unknown[]).length : 0;

  return (
    <div className="rounded-xl bg-background-200 p-3 shadow-geist-border">
      <div className="flex items-center gap-2">
        {result.ok ? (
          <CheckCircle2 className="size-4 shrink-0 text-green-900" />
        ) : (
          <XCircle className="size-4 shrink-0 text-red-900" />
        )}
        <span className="t-h-14">{result.sourceLabel}</span>
        <Badge variant="gray" size="sm">
          {result.kind === "freedict"
            ? "免费词典"
            : result.kind === "zerodict"
              ? "网络综合"
              : result.kind === "localdict"
                ? "本地词库"
                : result.kind === "youdao"
                  ? "有道词典"
                  : result.kind === "ai"
                    ? "AI"
                    : "HTTP API"}
        </Badge>
        {result.fromCache ? (
          <span className="t-mono-12 ml-auto text-gray-700">来自本地记录</span>
        ) : (
          <span className="t-mono-12 ml-auto text-gray-700">{result.tookMs}ms</span>
        )}
      </div>

      {result.ok && draft ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="t-label-12 text-gray-800">将填充 {fieldsCount} 个字段</span>
            {draft.summary?.phonetic ? <span className="t-mono-12 text-gray-700">{draft.summary.phonetic}</span> : null}
            {draft.summary?.posList?.length ? (
              <span className="t-label-12 text-gray-700">词性 {draft.summary.posList.join(" ")}</span>
            ) : null}
            {exampleCount ? <span className="t-label-12 text-gray-700">例句 {exampleCount}</span> : null}
            {familyCount ? <span className="t-label-12 text-gray-700">词族 {familyCount}</span> : null}
            {transformCount ? <span className="t-label-12 text-gray-700">词形 {transformCount}</span> : null}
          </div>

          {zhTranslations.length ? (
            <div className="space-y-1">
              {zhTranslations.map((t, i) => (
                <div key={i} className="t-label-13 text-gray-1000">
                  {zhTranslations.length > 1 ? `${i + 1}. ` : ""}
                  {t}
                </div>
              ))}
            </div>
          ) : null}

          {draft.summary?.definitions?.slice(0, 3).map((d, i) => (
            <div key={i} className="t-label-12 line-clamp-2 text-gray-800">
              {d}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-0.5">
            {targetEntry ? (
              <Button size="sm" onClick={() => onApply(targetEntry)}>
                应用到「{targetEntry.headword || "当前词条"}」（只补空缺）
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onCreate}>
              新建词条
            </Button>
          </div>
        </div>
      ) : (
        <div className="t-label-13 mt-2 text-red-900">{result.error}</div>
      )}
    </div>
  );
}
