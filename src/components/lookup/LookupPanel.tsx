"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Search, Sparkles, XCircle } from "lucide-react";
import type { Entry, LookupResult, Wordbook } from "@/lib/types";
import { makeEntry } from "@/lib/presets";
import { draftToValues } from "@/lib/importer";
import { runLookup } from "@/lib/lookup";
import { peekLocalSuggestions } from "@/lib/lookup/localdict";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book: Wordbook;
  targetEntry: Entry | null;
  onApplied: (entryId: string) => void;
}) {
  const sources = useAppStore((s) => s.lookupSources);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const [word, setWord] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [batchText, setBatchText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchFailed, setBatchFailed] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const activeSources = useMemo(() => sources.filter((s) => s.enabled && !excluded.has(s.id)), [sources, excluded]);

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

  const doLookup = async (override?: string) => {
    const w = (override ?? word ?? "").trim() || (targetEntry?.headword ?? "").trim();
    if (!w) {
      toast.error("请输入要检索的单词");
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const res = await runLookup(w, activeSources, book.schema, { localDictIds: dictionaries.map((d) => d.id) });
      setResults(res);
      if (res.every((r) => !r.ok)) toast.error("所有数据源均未返回结果");
    } finally {
      setLoading(false);
    }
  };

  const applyResult = (result: LookupResult, entry: Entry) => {
    if (!result.draft) return;
    // 只补空缺、不覆盖已填写内容（保护用户数据；需要覆盖时可在编辑器中手动更新）
    const { values, added, skipped } = draftToValues(result.draft.values, book.schema, entry.values, { overwrite: false });
    const tags = [...new Set([...entry.tags, ...(result.draft.suggestedTags ?? [])])];
    useAppStore.getState().updateEntry(book.id, entry.id, {
      values,
      tags,
      source: { kind: "lookup", label: result.sourceLabel, at: now() },
    });
    toast.success(`已填充 ${added.length} 个字段`, {
      description: skipped.length
        ? `保留 ${skipped.length} 个已填写字段未覆盖 · 来源：${result.sourceLabel}`
        : `来源：${result.sourceLabel}`,
    });
    onApplied(entry.id);
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
    const newEntries: Entry[] = [];
    const failed: string[] = [];
    for (let i = 0; i < words.length; i += 1) {
      if (controller.signal.aborted) break;
      const w = words[i];
      try {
        const res = await runLookup(w, activeSources, book.schema, {
          localDictIds: dictionaries.map((d) => d.id),
          signal: controller.signal,
        });
        const best = res.find((r) => r.ok && r.draft);
        if (best?.draft) {
          const { values } = draftToValues(best.draft.values, book.schema, {}, {});
          newEntries.push(
            makeEntry({
              headword: w,
              tags: best.draft.suggestedTags ?? [],
              values,
              source: { kind: "lookup", label: best.sourceLabel, at: now() },
            }),
          );
        } else {
          failed.push(w);
        }
      } catch {
        failed.push(w);
      }
      setBatchProgress({ done: i + 1, total: words.length });
    }
    if (newEntries.length) {
      useAppStore.getState().appendEntries(book.id, newEntries);
      toast.success(`批量检索完成：新增 ${newEntries.length} 条${failed.length ? `，${failed.length} 条未获取到内容` : ""}`);
      if (newEntries[0]) onApplied(newEntries[0].id);
    } else {
      toast.error("批量检索没有获得结果");
    }
    setBatchFailed(failed);
    setBatchRunning(false);
    abortRef.current = null;
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

        <Tabs defaultValue="single">
          <TabsList>
            <TabsTrigger value="single">单词检索</TabsTrigger>
            <TabsTrigger value="batch">批量导入单词表</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                list="wv-lookup-suggestions"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLookup()}
                placeholder={targetEntry?.headword ? `默认：${targetEntry.headword}` : "例如 abrupt"}
                autoFocus
              />
              <datalist id="wv-lookup-suggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
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
                    onClick={() => {
                      setWord(s);
                      void doLookup(s);
                    }}
                    className="t-mono-12 rounded-full bg-gray-100 px-2 py-0.5 text-gray-900 hover:bg-gray-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-800">
                <Loader2 className="size-4 animate-spin" /> 正在查询 {activeSources.length} 个数据源
              </div>
            ) : null}

            {!loading && results.length === 0 ? (
              <EmptyState
                icon={<Search className="size-4" />}
                title="等待检索"
                desc="结果会按数据源分组展示；应用到词条时只填充空缺字段。"
              />
            ) : null}

            <div className="space-y-3">
              {results.map((r) => (
                <ResultCard
                  key={r.sourceId}
                  result={r}
                  targetEntry={targetEntry}
                  onApply={(entry) => applyResult(r, entry)}
                  onCreate={() => createFromResult(r)}
                />
              ))}
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
        <span className="t-mono-12 ml-auto text-gray-700">{result.tookMs}ms</span>
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
