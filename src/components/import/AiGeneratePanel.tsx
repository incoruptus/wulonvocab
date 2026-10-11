"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Settings2, Sparkles, Wand2 } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import type { ParsedImport } from "@/lib/importer";
import { buildImportResult } from "@/lib/importer";
import { generateWordbookJson } from "@/lib/ai/generate";
import { defaultExportSettings, defaultSchema } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card } from "@/components/ui/misc";
import { requestSyncSoon } from "@/lib/sync/auto";
import { uid } from "@/lib/utils";

const DEFAULT_REQUEST =
  "考研英语核心词汇 30 个：音标、词性与释义（含用法 / 句型 / 例句 / 近义词）、词族、词性变换、常用搭配、联想与助记、情景标签；例句优先真实词典例句。";

const REQUEST_PRESETS = [
  "考研英语核心词汇 30 个，含词族、搭配与真题例句",
  "雅思写作 Task 2 高分词汇 40 个，按话题分组，附例句与中文翻译",
  "商务英语邮件高频短语 25 个，给出用法与例句",
];

function firstGloss(values: Record<string, unknown>): { phonetic: string; gloss: string } {
  const ph = values["phonetic"] as { uk?: string; us?: string } | undefined;
  const phonetic = (ph?.uk || ph?.us || "").trim();
  const senses = values["senses"] as { pos?: string; translation?: string }[] | undefined;
  const first = Array.isArray(senses) ? senses[0] : undefined;
  const gloss = first ? [first.pos, first.translation].filter(Boolean).join(" ") : "";
  return { phonetic, gloss: gloss.slice(0, 90) };
}

/** 内置 AI 生成词表：按 Skill 规范构造提示词 → 生成 → 预览 → 一键导入（与文件导入共用管线）。 */
export function AiGeneratePanel({
  onImported,
  variant = "panel",
}: {
  onImported: (bookId: string) => void;
  /** hero：首页场景——无卡片外框、标题更醒目，由页面提供容器 */
  variant?: "panel" | "hero";
}) {
  const books = useAppStore((s) => s.books);
  const lookupSources = useAppStore((s) => s.lookupSources);
  const replaceBook = useAppStore((s) => s.replaceBook);
  const appendEntries = useAppStore((s) => s.appendEntries);

  const aiSource = lookupSources.find((s) => s.kind === "ai" && s.enabled) ?? lookupSources.find((s) => s.kind === "ai");
  const configured = Boolean(aiSource?.config.baseUrl && aiSource?.config.model);

  const [request, setRequest] = useState(DEFAULT_REQUEST);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [preview, setPreview] = useState<Entry[]>([]);
  const [target, setTarget] = useState("new");
  const [name, setName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const targetBook: Wordbook | undefined = target === "new" ? undefined : books.find((b) => b.id === target);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setParsed(null);
    setPreview([]);
    setRunning(false);
  };

  const start = async () => {
    if (!aiSource) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setElapsed(0);
    setParsed(null);
    setPreview([]);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    try {
      const schema = targetBook?.schema ?? defaultSchema();
      const p = await generateWordbookJson({
        config: { baseUrl: aiSource.config.baseUrl ?? "", apiKey: aiSource.config.apiKey, model: aiSource.config.model ?? "" },
        schema,
        request: request.trim(),
        signal: controller.signal,
      });
      setParsed(p);
      const built = buildImportResult(p, {});
      setPreview(built.entries);
      setName((prev) => prev || p.wordbookMeta?.name || built.name || "AI 生成词表");
      toast.success(`已生成 ${built.entries.length} 条词条`, { description: "检查预览后点击导入" });
    } catch (e) {
      if (controller.signal.aborted) {
        toast.info("已取消生成");
      } else {
        const msg = (e as Error).message;
        toast.error(`生成失败：${msg}`, {
          description: /401|auth|api[\s_-]?key|unauthorized/i.test(msg)
            ? "提示：到「设置 → 词典数据源」检查 AI 源的 API Key 是否有效"
            : undefined,
        });
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunning(false);
      abortRef.current = null;
    }
  };

  const doImport = () => {
    if (!parsed) return;
    const result = buildImportResult(parsed, { name: name.trim() || undefined, baseBook: targetBook });
    if (!result.entries.length) {
      toast.error("没有可导入的词条");
      return;
    }
    if (targetBook) {
      appendEntries(targetBook.id, result.entries);
      toast.success(`已追加 ${result.entries.length} 个词条到「${targetBook.name}」`, { description: "重复单词已自动合并" });
      onImported(targetBook.id);
    } else {
      const now = Date.now();
      const book: Wordbook = {
        id: uid(),
        name: result.name,
        description: result.description ?? "",
        tags: result.tags,
        createdAt: now,
        updatedAt: now,
        schema: result.schema,
        entries: result.entries,
        exportSettings: defaultExportSettings(result.name),
        meta: result.meta,
      };
      replaceBook(book);
      toast.success(`已新建词库：${book.name}`, { description: `${result.entries.length} 个词条` });
      onImported(book.id);
    }
    reset();
    requestSyncSoon(); // 批量导入后 30s 推送（自动同步开启时才发生）
  };

  const Shell = variant === "hero" ? ("div" as const) : Card;

  return (
    <Shell className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-purple-700/10 text-purple-700">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <div className={variant === "hero" ? "t-h-20" : "t-h-16"}>AI 词表工坊</div>
          <p className="t-label-13 mt-0.5 text-gray-800">
            {variant === "hero"
              ? "说一句你想背什么词、想要哪些字段——AI 按 WulonVocab 规范生成，预览后一键入库。"
              : "描述需求，AI 按 WulonVocab Skill 规范直接输出词库并一键导入；也可以把 Skill 文件交给外部 AI 走手动流程。"}
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-700/10 p-3 text-[13px] text-amber-900">
            还没有接上 AI——到「设置 → 词典数据源」选一家服务商、贴上 Key（只保存在本机），就能在这里直接生成词表；
            生成与词典检索共用同一份配置。
          </div>
          <Link href="/settings">
            <Button variant="secondary" size="sm">
              <Settings2 className="size-3.5" /> 去配置 AI 数据源
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={running}
              placeholder="描述词表需求：主题、数量、需要哪些字段…"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {REQUEST_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={running}
                  onClick={() => setRequest(p)}
                  className="t-label-12 rounded-full bg-background-200 px-2.5 py-1 text-gray-900 shadow-geist-border transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  {p.length > 18 ? `${p.slice(0, 18)}…` : p}
                </button>
              ))}
              <span className="t-label-12 ml-auto text-gray-700">
                模型：{aiSource?.config.model} · 字段：{targetBook ? `${targetBook.schema.sections.length} 个（沿用目标词库）` : "按默认模板"}
              </span>
            </div>
          </div>

          {!parsed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={start} disabled={running || !request.trim()}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {running ? `生成中…已用 ${elapsed}s` : "生成词表"}
              </Button>
              {running ? (
                <>
                  <span className="t-label-12 text-gray-700">大词表要等 1–2 分钟，先别关页面</span>
                  <button
                    type="button"
                    className="t-label-12 text-gray-800 underline decoration-dotted hover:text-gray-1000"
                    onClick={() => abortRef.current?.abort()}
                  >
                    取消
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="green" size="sm">
                  <CheckCircle2 className="size-3" /> 生成成功 {preview.length} 条
                </Badge>
                <Button variant="tertiary" size="sm" onClick={start}>
                  <Sparkles className="size-3.5" /> 重新生成
                </Button>
                <span className="t-label-12 text-gray-700">检查无误后导入；导入后仍可在工作区编辑每个词条</span>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg bg-background-200 p-2 scroll-thin">
                {preview.slice(0, 300).map((e) => {
                  const { phonetic, gloss } = firstGloss(e.values);
                  return (
                    <div key={e.id} className="flex items-center gap-2 rounded-md bg-background-100 px-2.5 py-1.5 shadow-geist-border">
                      <span className="t-mono-13 shrink-0 font-medium text-gray-1000">{e.headword}</span>
                      {phonetic ? <span className="t-mono-12 hidden shrink-0 text-gray-800 sm:inline">{phonetic}</span> : null}
                      <span className="t-label-12 min-w-0 flex-1 truncate text-gray-900">{gloss}</span>
                    </div>
                  );
                })}
                {preview.length > 300 ? (
                  <div className="t-label-12 px-2 py-1 text-gray-700">还有 {preview.length - 300} 个词未显示（不影响导入）</div>
                ) : null}
              </div>

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
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：考研核心词汇 · 30" />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={doImport}>
                  <CheckCircle2 className="size-4" /> 导入 {preview.length} 个词条
                </Button>
                <Button variant="tertiary" onClick={reset}>
                  清空重来
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
