import type { LookupDraft, SectionDef, SectionType } from "../types";
import { isPlainObject } from "../utils";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

/* ============================================================
   AI 适配器與生成共用：任何 OpenAI 兼容接口（DeepSeek / OpenAI / Moonshot / 本地模型）
   1) lookup：按当前 Schema 动态生成提示词，输出可直接归一化的 JSON；
   2) chatCompletion：通用补全调用（词表生成等共用）。
   ============================================================ */

const SHAPE_HINTS: Record<SectionType, string> = {
  text: "字符串",
  markdown: "字符串（可用 **加粗** 等轻量 Markdown）",
  list: "字符串数组",
  tags: "字符串数组（简洁的中文标签）",
  pronunciation: '{"uk":"/音标/","us":"/音标/"}',
  senses:
    '[{"pos":"v.","translation":"中文释义","definition":"英文释义（可留空）","examples":[{"en":"例句","zh":"翻译"}],"usage":"用法说明","patterns":["句型结构"],"synonyms":["近义词"],"antonyms":["反义词"],"collocations":["固定搭配"],"notes":"备注"}]',
  examples: '[{"en":"例句","zh":"翻译","source":"出处（可留空）"}]',
  keyvalue: '[{"key":"派生词或词条","value":"释义"}]',
  transforms: '[{"form":"变形","pos":"词性","note":"说明（如 过去式）"}]',
  table: '{"columns":["列1","列2"],"rows":[["值1","值2"]]}',
  image: '[{"url":"图片地址","caption":"图注"}]',
  quote: "字符串",
  rating: "数字（1-5）",
  divider: "忽略此字段",
};

export function buildSchemaBrief(schema: { sections: SectionDef[] }): string {
  return schema.sections
    .filter((s) => s.type !== "divider")
    .map((s) => `- "${s.key}"（${s.label}，类型 ${s.type}）：${SHAPE_HINTS[s.type]}`)
    .join("\n");
}

export function buildAiPrompt(word: string, schema: { sections: SectionDef[] }, language: string, extra?: string): {
  system: string;
  user: string;
} {
  const system = [
    "你是一位严谨的词典编纂助手，负责为单词学习卡片生成结构化数据。",
    `释义语言：${language}。词性使用缩写（n. v. adj. adv. prep. conj. pron. num. int. 等）。`,
    "要求：",
    "1. 只输出一个 JSON 对象，不要输出任何解释或 Markdown 代码块标记；",
    "2. JSON 的键必须是下列字段键，值必须符合对应类型；",
    "3. 只填写你确定的内容，不确定的字段省略而不是编造；",
    "4. 例句要地道、长度适中，并为每条例句提供中文翻译；",
    "5. 释义请覆盖该词最常见、最实用的义项（考试高频义优先）。",
    "",
    "字段清单：",
    buildSchemaBrief(schema),
  ].join("\n");
  const user = [
    `请生成单词 "${word}" 的词卡数据。`,
    extra ? `补充要求：${extra}` : "",
    '输出格式示例：{"senses":[...],"family":[...]}（仅包含本词适用的字段）',
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

/* ---------------- 通用聊天补全 ---------------- */

export interface ChatConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** 多模态内容块（OpenAI 兼容；图片仅允许出现在 user 消息） */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" | "original" } };

export interface ToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  /** assistant 的历史工具调用（回传时必须原样带上） */
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCall[];
}

interface ChatResponseMessage {
  content?: unknown;
  tool_calls?: unknown;
}

interface ChatResponse {
  choices?: { message?: ChatResponseMessage }[];
  error?: { message?: string };
}

const EMPTY_RESULT_HINT = "模型未返回内容";

/** 解析 OpenAI 兼容响应体（非流式与流式降级共用） */
function parseChatJson(text: string): ChatCompletionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new LookupError("AI 接口返回的不是 JSON");
  }
  const message = (parsed as ChatResponse).choices?.[0]?.message;
  if (!message) throw new LookupError(EMPTY_RESULT_HINT);
  const content =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? (message.content as { type?: string; text?: string }[])
            .filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text as string)
            .join("\n")
        : "";
  const rawCalls = Array.isArray(message.tool_calls) ? (message.tool_calls as ToolCall[]) : [];
  const toolCalls = rawCalls.filter(
    (c) => c && typeof c.id === "string" && typeof c.function?.name === "string" && typeof c.function?.arguments === "string",
  );
  if (!content && !toolCalls.length) throw new LookupError(EMPTY_RESULT_HINT);
  return { content, toolCalls };
}

/**
 * OpenAI 兼容 chat/completions 调用（完整版）。
 * - jsonMode：请求 response_format=json_object；服务端不支持时自动降级重试（与 tools 互斥，带 tools 时不发）；
 * - tools：function calling 定义数组；
 * - 返回 { content, toolCalls }；网络/服务端错误统一抛 LookupError（含友好信息）。
 */
export async function chatCompletionMessage(
  cfg: ChatConfig,
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    jsonMode?: boolean;
    tools?: ToolDef[];
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<ChatCompletionResult> {
  const baseUrl = (cfg.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = (cfg.apiKey ?? "").trim();
  const model = (cfg.model ?? "").trim();
  if (!baseUrl) throw new LookupError("未配置 API Base URL");
  if (!model) throw new LookupError("未配置模型名称");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const hasTools = Boolean(opts.tools?.length);

  const attempt = async (jsonMode: boolean): Promise<ChatCompletionResult> => {
    const { signal: s, done } = withTimeout(opts.timeoutMs ?? 60000, opts.signal);
    try {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            temperature: opts.temperature ?? 0.2,
            messages,
            ...(jsonMode && !hasTools ? { response_format: { type: "json_object" } } : {}),
            ...(hasTools ? { tools: opts.tools } : {}),
          }),
          signal: s,
        });
      } catch (e) {
        // 网络层错误（DNS/代理/CORS/超时/取消）——给出可行动的提示
        if ((e as Error).name === "AbortError") throw e;
        if (opts.signal?.aborted) throw new LookupError("已取消");
        if ((e as Error).message === "超时") {
          throw new LookupError(`请求超时（${Math.round((opts.timeoutMs ?? 60000) / 1000)}s）——网络较慢或服务未响应`);
        }
        throw new LookupError(`无法连接 AI 接口（${(e as Error).message}）；请检查 Base URL 与网络/跨域是否可用`);
      }
      const text = await res.text();
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = JSON.parse(text) as ChatResponse;
          if (err.error?.message) msg = err.error.message;
        } catch {
          if (text.trim()) msg = `HTTP ${res.status}：${text.trim().slice(0, 200)}`;
        }
        throw new LookupError(msg);
      }
      let parsed: ChatCompletionResult;
      try {
        parsed = parseChatJson(text);
      } catch (e) {
        if (e instanceof LookupError) throw e;
        throw new LookupError(EMPTY_RESULT_HINT);
      }
      return parsed;
    } finally {
      done();
    }
  };

  if (opts.jsonMode === false || hasTools) return attempt(false);
  try {
    return await attempt(true);
  } catch (e) {
    // 仅在确实与 response_format/json 模式相关时降级重试（避免带图 400 等被整包重发、双倍计费）
    if (e instanceof LookupError && /response_format|json_object/i.test(e.message)) {
      return attempt(false);
    }
    throw e;
  }
}

/** 简化版：只要助手文本（既有调用方兼容） */
export async function chatCompletion(
  cfg: ChatConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; jsonMode?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const result = await chatCompletionMessage(cfg, messages, opts);
  if (!result.content) throw new LookupError(EMPTY_RESULT_HINT);
  return result.content;
}

/* ---------------- 流式补全（SSE） ---------------- */

export interface SseToolDelta {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

export interface SseDelta {
  content?: string;
  toolCalls?: SseToolDelta[];
}

/**
 * SSE 增量解析器（纯函数式）：喂入任意切分的文本块，产出 delta。
 * 容忍半截行、心跳注释、无法解析的 data 行（忽略而不炸流）。
 */
export function createSseParser(onDelta: (d: SseDelta) => void): { feed: (chunk: string) => void; flush: () => void } {
  let buffer = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let obj: unknown;
    try {
      obj = JSON.parse(payload);
    } catch {
      return;
    }
    const delta = (obj as { choices?: { delta?: { content?: unknown; tool_calls?: unknown } }[] }).choices?.[0]?.delta;
    if (!delta) return;
    const out: SseDelta = {};
    if (typeof delta.content === "string" && delta.content) out.content = delta.content;
    if (Array.isArray(delta.tool_calls)) {
      const calls = (
        delta.tool_calls as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }[]
      )
        .filter((c) => c && typeof c.index === "number")
        .map((c) => ({
          index: c.index as number,
          id: typeof c.id === "string" ? c.id : undefined,
          name: typeof c.function?.name === "string" ? (c.function!.name as string) : undefined,
          arguments: typeof c.function?.arguments === "string" ? (c.function!.arguments as string) : undefined,
        }));
      if (calls.length) out.toolCalls = calls;
    }
    if (out.content || out.toolCalls) onDelta(out);
  };
  return {
    feed(chunk: string) {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    },
    flush() {
      if (buffer) handleLine(buffer);
      buffer = "";
    },
  };
}

/**
 * 流式 chat/completions（OpenAI 兼容 SSE）。
 * - onDelta：增量文本（正文）；tool_calls 增量按 index 聚合，流结束后产出完整 ToolCall[]；
 * - 服务端不支持流式（非 event-stream）时自动降级为整体 JSON（一次性触发 onDelta）；
 * - 取消/超时/网络错误统一抛 LookupError。
 */
export async function streamChatCompletionMessage(
  cfg: ChatConfig,
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    tools?: ToolDef[];
    signal?: AbortSignal;
    timeoutMs?: number;
    onDelta?: (text: string) => void;
  } = {},
): Promise<ChatCompletionResult> {
  const baseUrl = (cfg.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = (cfg.apiKey ?? "").trim();
  const model = (cfg.model ?? "").trim();
  if (!baseUrl) throw new LookupError("未配置 API Base URL");
  if (!model) throw new LookupError("未配置模型名称");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const hasTools = Boolean(opts.tools?.length);
  const { signal: s, done } = withTimeout(opts.timeoutMs ?? 180000, opts.signal);
  try {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.2,
          messages,
          stream: true,
          ...(hasTools ? { tools: opts.tools } : {}),
        }),
        signal: s,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      if (opts.signal?.aborted) throw new LookupError("已取消");
      if ((e as Error).message === "超时") {
        throw new LookupError(`请求超时（${Math.round((opts.timeoutMs ?? 180000) / 1000)}s）——网络较慢或服务未响应`);
      }
      throw new LookupError(`无法连接 AI 接口（${(e as Error).message}）；请检查 Base URL 与网络/跨域是否可用`);
    }
    if (!res.ok) {
      const text = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(text) as ChatResponse;
        if (err.error?.message) msg = err.error.message;
      } catch {
        if (text.trim()) msg = `HTTP ${res.status}：${text.trim().slice(0, 200)}`;
      }
      throw new LookupError(msg);
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/event-stream/i.test(ctype) || !res.body) {
      // 服务端不支持流式：退回整体 JSON（把完整文本作为一次 delta 播出）
      const text = await res.text();
      const result = parseChatJson(text);
      if (result.content) opts.onDelta?.(result.content);
      return result;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    const acc = new Map<number, { id: string; name: string; args: string }>();
    const parser = createSseParser((d) => {
      if (d.content) {
        content += d.content;
        opts.onDelta?.(d.content);
      }
      for (const tc of d.toolCalls ?? []) {
        const cur = acc.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.name) cur.name = tc.name;
        if (tc.arguments) cur.args += tc.arguments;
        acc.set(tc.index, cur);
      }
    });
    try {
      for (;;) {
        const { done: rdDone, value } = await reader.read();
        if (rdDone) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.feed(decoder.decode());
      parser.flush();
    } catch (e) {
      if (opts.signal?.aborted) throw new LookupError("已取消");
      if ((e as Error).message === "超时") throw new LookupError("流式响应中断（超时）——网络较慢或服务未响应");
      throw new LookupError(`流式连接中断：${(e as Error).message}`);
    }
    const toolCalls: ToolCall[] = [...acc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, cur]) => ({
        id: cur.id || `call_stream_${index}`,
        type: "function",
        function: { name: cur.name, arguments: cur.args || "{}" },
      }))
      .filter((c) => c.function.name);
    if (!content && !toolCalls.length) throw new LookupError(EMPTY_RESULT_HINT);
    return { content, toolCalls };
  } finally {
    done();
  }
}

/** 从模型输出中提取 JSON 文本（剥离代码块围栏 / 前后说明文字） */
export function extractJsonText(content: string): string {
  const fenced = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  if (fenced.startsWith("{") || fenced.startsWith("[")) return fenced;
  const objStart = fenced.indexOf("{");
  const arrStart = fenced.indexOf("[");
  const start = [objStart, arrStart].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start == null) return fenced;
  const lastObj = fenced.lastIndexOf("}");
  const lastArr = fenced.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end > start) return fenced.slice(start, end + 1);
  return fenced;
}

/* ---------------- 单词检索适配器 ---------------- */

export const aiAdapter: DictionaryAdapter = {
  kind: "ai",
  async lookup({ word, schema, config, signal }: LookupContext): Promise<LookupDraft> {
    const { system, user } = buildAiPrompt(word, schema, config.language || "中文", config.extraPrompt);
    const content = await chatCompletion(
      { baseUrl: config.baseUrl ?? "", apiKey: config.apiKey, model: config.model ?? "" },
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.2, jsonMode: true, signal },
    );

    const jsonText = extractJsonText(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new LookupError("模型输出不是合法 JSON");
    }
    if (!isPlainObject(parsed)) throw new LookupError("模型输出 JSON 结构异常");

    const obj = parsed as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    const nested = isPlainObject(obj.values) ? (obj.values as Record<string, unknown>) : obj;
    for (const [k, v] of Object.entries(nested)) {
      if (["headword", "word", "单词"].includes(k)) continue;
      if (v == null) continue;
      values[k] = v;
    }
    if (!Object.keys(values).length) throw new LookupError("模型输出中没有可用的字段");
    return {
      values,
      suggestedTags: ["AI 生成"],
      summary: { headword: word },
    };
  },
};
