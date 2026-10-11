"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, Loader2, Send, Sparkles, Square, Wrench } from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { agentSystemPrompt, AGENT_TOOL_LABELS, buildAgentTools, runAgentTurn, type AgentEvent, type AgentThread } from "@/lib/ai/agent";
import { makeAgentExecutor } from "@/lib/ai/agentExec";
import { clearAgentChat, loadAgentChat, saveAgentChat, type AgentChatItem } from "@/lib/ai/agentStore";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/overlay";
import { cx } from "@/lib/utils";

/** 把尾部流式气泡定型（关闭光标）；无变更时原样返回 */
function finalizeStreaming(items: AgentChatItem[]): AgentChatItem[] {
  const last = items.at(-1);
  if (last?.kind !== "assistant" || !last.streaming) return items;
  const next = [...items];
  next[next.length - 1] = { ...last, streaming: false };
  return next;
}

/**
 * AI 词库管家：对话 → 工具调用（本地执行）→ 危险操作两段式确认 → 汇报。
 * 流式输出（delta 增量渲染）；会话按词库持久化（独立 IDB），关掉再开接着聊。
 * 工具写入全部经 store 既有 actions；Key 只在本机。
 */
export function AgentPanel({
  book,
  open,
  onOpenChange,
}: {
  book: Wordbook;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const sources = useAppStore((s) => s.lookupSources);
  const aiSource = sources.find((s) => s.kind === "ai" && s.enabled) ?? sources.find((s) => s.kind === "ai");
  const configured = Boolean(aiSource?.config.baseUrl && aiSource?.config.model);

  const [items, setItems] = useState<AgentChatItem[]>([]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<string | null>(null);
  const confirmRef = useRef<((v: boolean) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<AgentThread>({ messages: [] });
  const scrollRef = useRef<HTMLDivElement>(null);

  const tools = useMemo(() => buildAgentTools(), []);
  const exec = useMemo(() => makeAgentExecutor(book.id), [book.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, confirmSummary]);

  // 卸载（切路由/整页离开）时中止在跑的回合并释放挂起的确认
  useEffect(
    () => () => {
      abortRef.current?.abort();
      confirmRef.current?.(false);
    },
    [],
  );

  // 打开本词库：载入已存会话（system 提示以当前词库重建）；没有则开新对话
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const freshThread = (): AgentThread => ({ messages: [{ role: "system", content: agentSystemPrompt(book) }] });
    void loadAgentChat(book.id).then((stored) => {
      if (!alive) return;
      if (stored && stored.items.length) {
        threadRef.current = {
          messages: [
            { role: "system", content: agentSystemPrompt(book) },
            ...stored.messages.filter((m) => m.role !== "system"),
          ],
        };
        setItems(stored.items);
      } else {
        threadRef.current = freshThread();
        setItems([]);
      }
      setHydratedKey(book.id);
    });
    return () => {
      alive = false;
    };
    // book 的提示只取名称/数量/schema，随词库对象变化由书 id 变化覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book.id]);

  // 会话持久化（防抖；载入完成前不写，避免把空态覆盖到已存历史）
  useEffect(() => {
    if (!open || hydratedKey !== book.id || !items.length) return;
    const t = setTimeout(() => {
      void saveAgentChat(book.id, { items, messages: threadRef.current.messages });
    }, 700);
    return () => clearTimeout(t);
  }, [items, open, hydratedKey, book.id]);

  const resetThread = () => {
    threadRef.current = { messages: [{ role: "system", content: agentSystemPrompt(book) }] };
    setItems([]);
    setConfirmSummary(null);
    void clearAgentChat(book.id);
  };

  const resolveConfirm = (v: boolean) => {
    confirmRef.current?.(v);
    confirmRef.current = null;
    setConfirmSummary(null);
  };

  const confirm = (summary: string) =>
    new Promise<boolean>((resolve) => {
      confirmRef.current = resolve;
      setConfirmSummary(summary);
    });

  const send = async () => {
    const text = input.trim();
    if (!text || running || !configured || !aiSource) return;
    if (!threadRef.current.messages.length) resetThread();
    setInput("");
    setItems((prev) => [...prev, { kind: "user", text }]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runAgentTurn({
        cfg: {
          baseUrl: aiSource.config.baseUrl ?? "",
          apiKey: aiSource.config.apiKey,
          model: aiSource.config.model ?? "",
        },
        thread: threadRef.current,
        userText: text,
        tools,
        exec,
        confirm,
        stream: true,
        signal: controller.signal,
        onEvent: (e: AgentEvent) => {
          if (e.type === "delta" && e.text) {
            const chunk = e.text;
            setItems((prev) => {
              const last = prev.at(-1);
              if (last?.kind === "assistant" && last.streaming) {
                const next = [...prev];
                next[next.length - 1] = { ...last, text: last.text + chunk };
                return next;
              }
              return [...prev, { kind: "assistant", text: chunk, streaming: true }];
            });
          } else if (e.type === "assistant-end") {
            setItems((prev) => {
              const last = prev.at(-1);
              if (last?.kind !== "assistant" || !last.streaming) return prev;
              const next = [...prev];
              next[next.length - 1] = { ...last, streaming: false };
              return next;
            });
          } else if (e.type === "assistant" && e.text) {
            setItems((prev) => [...prev, { kind: "assistant", text: e.text as string }]);
          } else if (e.type === "tool-call") {
            setItems((prev) => [...finalizeStreaming(prev), { kind: "tool", name: e.name, text: e.args ?? "", state: "running" }]);
          } else if (e.type === "tool-result") {
            setItems((prev) => {
              const idx = [...prev].reverse().findIndex((it) => it.kind === "tool" && it.name === e.name && it.state === "running");
              if (idx < 0) return prev;
              const realIdx = prev.length - 1 - idx;
              const next = [...prev];
              next[realIdx] = {
                ...next[realIdx],
                state: "ok",
                text: `${next[realIdx].text}\n→ ${(e.result ?? "").slice(0, 300)}`,
              };
              return next;
            });
          } else if (e.type === "stop") {
            setItems((prev) => [...finalizeStreaming(prev), { kind: "stop", text: e.reason ?? "已停止" }]);
          }
        },
      });
    } catch (e) {
      if (controller.signal.aborted) {
        setItems((prev) => (prev.at(-1)?.kind === "stop" ? prev : [...finalizeStreaming(prev), { kind: "stop", text: "已停止" }]));
      } else {
        const msg = (e as Error).message;
        setItems((prev) => [...finalizeStreaming(prev), { kind: "assistant", text: `出错了：${msg}` }]);
        toast.error(`AI 管家：${msg}`, {
          description: /401|auth|key/i.test(msg) ? "到「设置 → 词典数据源 → AI」更新 API Key" : undefined,
        });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      resolveConfirm(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          // 关闭即中止：避免面板背后的非确认类工具继续写库
          abortRef.current?.abort();
          resolveConfirm(false);
        }
      }}
      widthClass="max-w-2xl"
    >
      <DialogHeader
        title="AI 词库管家"
        desc={`直接让它加词、补字段、查重……动手前都会先给你过目；当前词库「${book.name}」`}
      />
      <DialogBody className="flex h-[62vh] flex-col gap-3">
        {!configured ? (
          <div className="rounded-lg bg-amber-700/10 p-3 text-[13px] text-amber-900">
                还没有接上 AI。到「设置 → 词典数据源 → AI」选一家服务商、贴上 Key（只保存在本机）。
          </div>
        ) : null}

        <div ref={scrollRef} aria-live="polite" aria-label="对话记录" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-lg bg-background-200 p-3 scroll-thin">
          {items.length === 0 ? (
            <div className="space-y-1.5 py-6 text-center">
              <Sparkles className="mx-auto size-5 text-gray-700" />
              <div className="t-label-13 text-gray-800">试试：「加 10 个考研高频词」「把缺音标的词补上」「新增字段『常用搭配』」</div>
            </div>
          ) : null}
          {items.map((it, i) => {
            if (it.kind === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-br-sm bg-blue-100 px-3 py-2 text-[13px] text-gray-1000">{it.text}</div>
                </div>
              );
            }
            if (it.kind === "assistant") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gray-1000 text-background-100">
                    <Bot className="size-3.5" />
                  </span>
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-bl-sm bg-background-100 px-3 py-2 text-[13px] text-gray-1000 shadow-geist-border">
                    {it.text}
                    {it.streaming ? (
                      <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse rounded-full bg-gray-700 align-[-0.1em]" />
                    ) : null}
                  </div>
                </div>
              );
            }
            if (it.kind === "tool") {
              return (
                <div key={i} className="ml-8 rounded-lg bg-background-100 px-2.5 py-1.5 text-[12px] shadow-geist-border">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="size-3 text-gray-800" />
                    <span className="t-mono-12 text-gray-1000" title={it.name}>
                      {it.name ? (AGENT_TOOL_LABELS[it.name] ?? it.name) : ""}
                    </span>
                    {it.state === "running" ? (
                      <Loader2 className="size-3 animate-spin text-gray-700" />
                    ) : (
                      <Check className="size-3 text-green-800" />
                    )}
                  </div>
                  <pre className="t-mono-12 mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-gray-800">{it.text}</pre>
                </div>
              );
            }
            return (
              <div key={i} className="rounded-lg bg-amber-700/10 px-3 py-1.5 text-[12px] text-amber-900">{it.text}</div>
            );
          })}
        </div>

        {confirmSummary ? (
          <div role="alertdialog" aria-live="assertive" aria-label="需要你确认" className="space-y-2 rounded-lg border border-amber-700/40 bg-amber-700/10 p-3">
            <div className="t-label-13 font-medium text-amber-900">需要你确认</div>
            <div className="text-[13px] text-amber-900">{confirmSummary}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" autoFocus onClick={() => resolveConfirm(true)}>确认执行</Button>
              <Button size="sm" variant="secondary" onClick={() => resolveConfirm(false)}>取消</Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!configured || running}
            placeholder={configured ? "说一句要它做什么（Enter 发送，Shift+Enter 换行）" : "先配置 AI 数据源"}
            className="t-copy-14 max-h-28 min-h-9 flex-1 resize-none rounded-md bg-background-100 px-3 py-2 text-gray-1000 shadow-geist-border outline-none focus:ring-2 focus:ring-blue-700/40 disabled:opacity-60"
          />
          {running ? (
            <IconButton
              label="停止"
              onClick={() => {
                abortRef.current?.abort();
                resolveConfirm(false); // 正卡在确认流时也要释放（确认后不会执行 apply）
              }}
            >
              <Square className="size-4" />
            </IconButton>
          ) : (
            <IconButton label="发送" onClick={send} className={cx(!configured && "opacity-50")}>
              <Send className="size-4" />
            </IconButton>
          )}
          <Button variant="tertiary" size="sm" onClick={resetThread} disabled={running}>
            新对话
          </Button>
        </div>
        {aiSource ? (
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">{aiSource.config.model}</Badge>
            <span className="t-label-12 text-gray-700">工具在本机执行；新增字段与删除词条都会先给你过目。</span>
          </div>
        ) : null}
      </DialogBody>
    </Dialog>
  );
}
