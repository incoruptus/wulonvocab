"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardPaste, Loader2, Sparkles, Wand2, XCircle } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { draftToValues } from "@/lib/importer";
import { runBatchLookup } from "@/lib/lookup/batch";
import { createEmptyBook, defaultSchema, makeEntry } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, SwitchRow, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card } from "@/components/ui/misc";
import { requestSyncSoon } from "@/lib/sync/auto";
import { cx } from "@/lib/utils";

interface WordMatch {
  word: string;
  status: "found" | "missing";
  values?: Record<string, unknown>;
  tags?: string[];
  source?: string;
  phonetic?: string;
  gloss?: string;
}

function previewOf(values: Record<string, unknown>): { phonetic: string; gloss: string } {
  const ph = values["phonetic"] as { uk?: string; us?: string } | undefined;
  const phonetic = (ph?.uk || ph?.us || "").trim();
  const senses = values["senses"] as { pos?: string; translation?: string }[] | undefined;
  const first = Array.isArray(senses) ? senses[0] : undefined;
  const gloss = first ? [first.pos, first.translation].filter(Boolean).join(" ") : "";
  return { phonetic, gloss: gloss.slice(0, 90) };
}

/**
 * 纯文本粘贴导入：小写英文逗号分隔的单词列表 → 词典匹配 → 预览 → 一键导入。
 * 匹配结果只取每条词的第一个可用数据源；未匹配的词可选保留（空词条，回头补）。
 */
export function TextImportPanel({ onImported }: { onImported: (bookId: string) => void }) {
  const books = useAppStore((s) => s.books);
  const lookupSources = useAppStore((s) => s.lookupSources);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const replaceBook = useAppStore((s) => s.replaceBook);
  const appendEntries = useAppStore((s) => s.appendEntries);

  const [text, setText] = useState("");
  const [matches, setMatches] = useState<WordMatch[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [includeMissing, setIncludeMissing] = useState(true);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  /** 匹配请求代次：清空重来/重新匹配作废旧回调，防止预览"复活" */
  const matchReqRef = useRef(0);

  const parsed = useMemo(() => {
    const tokens = text
      .split(/[,，;；\n\r\t]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!/^[a-z][a-z'\- ]{0,40}$/.test(t)) {
        if (invalid.length < 20) invalid.push(t);
        continue;
      }
      if (seen.has(t)) continue;
      seen.add(t);
      valid.push(t);
    }
    return { valid, invalid, dup: tokens.length - new Set(tokens).size };
  }, [text]);

  const targetBook: Wordbook | undefined = target === "new" ? undefined : books.find((b) => b.id === target);
  const enabledSourceCount = lookupSources.filter((s) => s.enabled).length;

  /** 匹配与导入用的 schema：不能在渲染期构造（uid 走 crypto.randomUUID，预渲染会报错） */
  const currentSchema = () => targetBook?.schema ?? defaultSchema();

  const enabledMatches = matches?.filter((m) => m.status === "found") ?? [];
  const missingMatches = matches?.filter((m) => m.status === "missing") ?? [];

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMatches(null);
    setRunning(false);
    setProgress({ done: 0, total: 0 });
    matchReqRef.current += 1;
  };

  /** 逐词匹配：并发池 + 可中止（引擎与「补全空缺 / 批量导入」共用） */
  const startMatch = async () => {
    if (!parsed.valid.length) {
      toast.error("还没有可识别的单词");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const schema = currentSchema();
    const req = ++matchReqRef.current;
    setMatches(parsed.valid.map((w) => ({ word: w, status: "missing" })));
    setRunning(true);
    setProgress({ done: 0, total: parsed.valid.length });
    const items = await runBatchLookup(
      parsed.valid.map((w) => ({ key: w, word: w })),
      {
        sources: lookupSources,
        schema,
        localDictIds: dictionaries.map((d) => d.id),
        signal: controller.signal,
        onProgress: (done, total) => {
          if (matchReqRef.current === req) setProgress({ done, total });
        },
      },
    );
    if (matchReqRef.current !== req) return; // 已被清空/重跑：丢弃过期续体
    setMatches(
      items.map((it) => {
        if (it.best?.draft) {
          const { values } = draftToValues(it.best.draft.values, schema, {}, {});
          const { phonetic, gloss } = previewOf(values);
          return {
            word: it.word,
            status: "found",
            values,
            tags: it.best.draft.suggestedTags ?? [],
            source: it.best.sourceLabel,
            phonetic,
            gloss,
          };
        }
        return { word: it.word, status: "missing" };
      }),
    );
    setRunning(false);
    abortRef.current = null;
  };

  const doImport = () => {
    const schema = currentSchema();
    const toImport = (matches ?? []).filter((m) => m.status === "found" || includeMissing);
    if (!toImport.length) {
      toast.error("没有可导入的词条");
      return;
    }
    const entries: Entry[] = toImport.map((m) =>
      makeEntry({
        headword: m.word,
        tags: m.status === "found" ? (m.tags ?? []) : ["待补充"],
        values: m.values ?? {},
        source: m.status === "found" && m.source ? { kind: "lookup", label: m.source, at: Date.now() } : undefined,
      }),
    );
    if (targetBook) {
      appendEntries(targetBook.id, entries);
      toast.success(`已追加 ${entries.length} 个词条到「${targetBook.name}」`, { description: "重复单词已自动合并" });
      onImported(targetBook.id);
    } else {
      const book = createEmptyBook(name.trim() || `粘贴导入 · ${entries.length} 词`, schema);
      replaceBook({ ...book, entries });
      toast.success(`已新建词库：${book.name}`, {
        description: `${entries.length} 个词条${missingMatches.length && includeMissing ? ` · ${missingMatches.length} 个待补充` : ""}`,
      });
      onImported(book.id);
    }
    setText("");
    reset();
    requestSyncSoon(); // 批量导入后 30s 推送（自动同步开启时才发生）
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-900">
          <ClipboardPaste className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="t-h-16">粘贴单词列表</div>
          <p className="t-label-13 mt-0.5 text-gray-800">
            用英文逗号<span className="mx-0.5 rounded bg-gray-100 px-1 font-mono text-[12px]">,</span>把小写单词串起来（换行也认）。
            在备忘录里整理成行，再整段粘过来就好。
          </p>
        </div>
      </div>

      <Textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (matches) reset();
        }}
        placeholder="abandon, ability, abstract, academic, accompany, accurate, …"
        className="t-mono-13"
        disabled={running}
      />

      {/* 解析状态 */}
      <div className="flex flex-wrap items-center gap-2">
        {parsed.valid.length ? (
          <>
            <Badge variant="blue" size="sm">
              {parsed.valid.length} 个单词
            </Badge>
            {parsed.dup > 0 ? (
              <span className="t-label-12 text-gray-800">已去重 {parsed.dup} 个</span>
            ) : null}
            {parsed.invalid.length ? (
              <span className="t-label-12 text-amber-900" title={parsed.invalid.join("、")}>
                忽略 {parsed.invalid.length} 段非单词文本
              </span>
            ) : null}
          </>
        ) : (
          <span className="t-label-12 text-gray-700">粘贴后自动统计与去重；中英文逗号、分号、换行都能混着来</span>
        )}
      </div>

      {!matches ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startMatch} disabled={!parsed.valid.length || running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            匹配释义并预览
          </Button>
          <Button
            variant="secondary"
            disabled={!parsed.valid.length || running}
            onClick={() => {
              setMatches(parsed.valid.map((w) => ({ word: w, status: "missing" as const })));
              setName(`粘贴导入 · ${parsed.valid.length} 词`);
            }}
          >
            直接导入（不匹配）
          </Button>
          <span className="t-label-12 text-gray-700">
            {enabledSourceCount ? `将使用 ${enabledSourceCount} 个已启用的词典数据源` : "没有启用的数据源，可在设置中开启"}
          </span>
        </div>
      ) : (
        <>
          {running ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-gray-800" />
                <span className="t-label-13 tabular-nums text-gray-900">
                  匹配中 {progress.done} / {progress.total}
                </span>
                <button
                  type="button"
                  className="t-label-12 ml-auto text-gray-800 underline decoration-dotted hover:text-gray-1000"
                  onClick={() => abortRef.current?.abort()}
                >
                  停止
                </button>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-700 transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="green" size="sm">
                <CheckCircle2 className="size-3" /> 匹配到 {enabledMatches.length}
              </Badge>
              {missingMatches.length ? (
                <Badge variant="amber" size="sm">
                  <XCircle className="size-3" /> 未匹配 {missingMatches.length}
                </Badge>
              ) : null}
              <Button variant="tertiary" size="sm" onClick={startMatch}>
                <Sparkles className="size-3.5" /> 重新匹配
              </Button>
            </div>
          )}

          {/* 预览列表 */}
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg bg-background-200 p-2 scroll-thin">
            {matches.slice(0, 300).map((m) => (
              <div key={m.word} className="flex items-center gap-2 rounded-md bg-background-100 px-2.5 py-1.5 shadow-geist-border">
                <span className={cx("t-mono-13 shrink-0 font-medium", m.status === "missing" ? "text-gray-700" : "text-gray-1000")}>
                  {m.word}
                </span>
                {m.phonetic ? <span className="t-mono-12 shrink-0 text-gray-800">{m.phonetic}</span> : null}
                <span className="t-label-12 min-w-0 flex-1 truncate text-gray-900">
                  {m.gloss || (m.status === "missing" ? "未匹配到释义" : "")}
                </span>
                {m.source ? <span className="t-label-12 hidden shrink-0 text-gray-700 sm:inline">{m.source}</span> : null}
                {m.status === "missing" ? <XCircle className="size-3.5 shrink-0 text-amber-700" /> : <CheckCircle2 className="size-3.5 shrink-0 text-green-800" />}
              </div>
            ))}
            {matches.length > 300 ? (
              <div className="t-label-12 px-2 py-1 text-gray-700">还有 {matches.length - 300} 个词未显示（不影响导入）</div>
            ) : null}
          </div>

          {missingMatches.length ? (
            <SwitchRow
              label="未匹配的词也导入"
              hint="生成只有单词的空词条并标记「待补充」，可回头用词典检索补齐"
              checked={includeMissing}
              onCheckedChange={setIncludeMissing}
            />
          ) : null}

          {/* 目标与命名 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="t-label-13 font-medium text-gray-900">导入到</div>
              <Select
                value={target}
                onValueChange={setTarget}
                options={[
                  { value: "new", label: "新建词库" },
                  ...books.map((b) => ({ value: b.id, label: `追加到：${b.name}` })),
                ]}
              />
            </div>
            {target === "new" ? (
              <div className="space-y-1.5">
                <div className="t-label-13 font-medium text-gray-900">词库名称</div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`粘贴导入 · ${enabledMatches.length + (includeMissing ? missingMatches.length : 0)} 词`}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={doImport} disabled={running}>
              <CheckCircle2 className="size-4" /> 导入 {enabledMatches.length + (includeMissing ? missingMatches.length : 0)} 个词条
            </Button>
            <Button variant="tertiary" onClick={reset} disabled={running}>
              清空重来
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
