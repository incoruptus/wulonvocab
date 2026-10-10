"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Search, Sparkles, XCircle } from "lucide-react";
import type { Entry, LookupResult, Wordbook } from "@/lib/types";
import { makeEntry } from "@/lib/presets";
import { draftToValues } from "@/lib/importer";
import { runLookup } from "@/lib/lookup";
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
  const abortRef = useRef<AbortController | null>(null);

  const activeSources = useMemo(() => sources.filter((s) => s.enabled && !excluded.has(s.id)), [sources, excluded]);

  const doLookup = async () => {
    const w = (word || targetEntry?.headword || "").trim();
    if (!w) {
      toast.error("?????????");
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const res = await runLookup(w, activeSources, book.schema, { localDictIds: dictionaries.map((d) => d.id) });
      setResults(res);
      if (res.every((r) => !r.ok)) toast.error("???????????");
    } finally {
      setLoading(false);
    }
  };

  const applyResult = (result: LookupResult, entry: Entry) => {
    if (!result.draft) return;
    const { values, added } = draftToValues(result.draft.values, book.schema, entry.values, { overwrite: true });
    const tags = [...new Set([...entry.tags, ...(result.draft.suggestedTags ?? [])])];
    useAppStore.getState().updateEntry(book.id, entry.id, {
      values,
      tags,
      source: { kind: "lookup", label: result.sourceLabel, at: now() },
    });
    toast.success(`??? ${added.length} ???`, { description: `???${result.sourceLabel}` });
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
    toast.success(`??????${result.word}?`);
    onApplied(entry.id);
  };

  const runBatch = async () => {
    const words = [...new Set(batchText.split(/[\n,?;?\s]+/).map((w) => w.trim()).filter(Boolean))];
    if (!words.length) {
      toast.error("?????????????");
      return;
    }
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: words.length });
    const controller = new AbortController();
    abortRef.current = controller;
    const newEntries: Entry[] = [];
    let failed = 0;
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
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      setBatchProgress({ done: i + 1, total: words.length });
    }
    if (newEntries.length) {
      useAppStore.getState().appendEntries(book.id, newEntries);
      toast.success(`????????? ${newEntries.length} ?${failed ? `?${failed} ???` : ""}`);
      if (newEntries[0]) onApplied(newEntries[0].id);
    } else {
      toast.error("??????????");
    }
    setBatchRunning(false);
    abortRef.current = null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-3xl">
      <DialogHeader
        title="????"
        desc={
          targetEntry
            ? `????????????${targetEntry.headword || "?????"}?`
            : "??????????????????"
        }
      />
      <DialogBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-label-12 text-gray-800">???</span>
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
                title={s.enabled ? "" : "???????????????"}
              >
                {s.label}
                {s.kind === "localdict" ? `?${dictionaries.length} ????` : ""}
              </button>
            );
          })}
        </div>

        <Tabs defaultValue="single">
          <TabsList>
            <TabsTrigger value="single">????</TabsTrigger>
            <TabsTrigger value="batch">???????</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLookup()}
                placeholder={targetEntry?.headword ? `???${targetEntry.headword}` : "?? abrupt"}
                autoFocus
              />
              <Button onClick={doLookup} loading={loading}>
                <Search className="size-4" /> ??
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-800">
                <Loader2 className="size-4 animate-spin" /> ???? {activeSources.length} ????
              </div>
            ) : null}

            {!loading && results.length === 0 ? (
              <EmptyState
                icon={<Search className="size-4" />}
                title="????"
                desc="????????????????????????????"
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
              placeholder={"??????????? / ?????\nabandon\nresilient\ncomprehensive"}
              className="text-[13px]"
            />
            <div className="flex items-center gap-2">
              <Button onClick={runBatch} loading={batchRunning}>
                <Sparkles className="size-4" /> ??????
              </Button>
              {batchRunning ? (
                <>
                  <span className="t-mono-12 text-gray-800">
                    {batchProgress.done}/{batchProgress.total}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                    ??
                  </Button>
                </>
              ) : (
                <span className="t-label-12 text-gray-700">????????????????????????????</span>
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
          </TabsContent>
        </Tabs>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          ??
        </Button>
      </DialogFooter>
    </Dialog>
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
  const fieldsCount = draft ? Object.keys(draft.values).length : 0;
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
            ? "????"
            : result.kind === "localdict"
              ? "????"
              : result.kind === "ai"
                ? "AI"
                : "HTTP API"}
        </Badge>
        <span className="t-mono-12 ml-auto text-gray-700">{result.tookMs}ms</span>
      </div>

      {result.ok && draft ? (
        <div className="mt-2 space-y-1.5">
          <div className="t-label-12 text-gray-800">
            ??? {fieldsCount} ???
            {draft.summary?.posList?.length ? `??? ${draft.summary.posList.join(" ")}?` : ""}
          </div>
          {draft.summary?.definitions?.slice(0, 3).map((d, i) => (
            <div key={i} className="t-label-13 line-clamp-2 text-gray-1000">
              {i + 1}. {d}
            </div>
          ))}
          {!draft.summary?.definitions?.length && fieldsCount > 0 ? (
            <div className="t-label-12 text-gray-700">??????????????????????</div>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            {targetEntry ? (
              <Button size="sm" onClick={() => onApply(targetEntry)}>
                ????{targetEntry.headword || "????"}?
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onCreate}>
              ????
            </Button>
          </div>
        </div>
      ) : (
        <div className="t-label-13 mt-2 text-red-900">{result.error}</div>
      )}
    </div>
  );
}
