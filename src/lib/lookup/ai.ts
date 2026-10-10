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

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * OpenAI 兼容 chat/completions 调用。
 * - jsonMode：请求 response_format=json_object；服务端不支持时自动降级重试；
 * - 返回助手消息文本；网络/服务端错误统一抛 LookupError（含友好信息）。
 */
export async function chatCompletion(
  cfg: ChatConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; jsonMode?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const baseUrl = (cfg.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = (cfg.apiKey ?? "").trim();
  const model = (cfg.model ?? "").trim();
  if (!baseUrl) throw new LookupError("未配置 API Base URL");
  if (!model) throw new LookupError("未配置模型名称");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

  const attempt = async (jsonMode: boolean): Promise<string> => {
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
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: s,
        });
      } catch (e) {
        // 网络层错误（DNS/代理/CORS）——给出可行动的提示
        if ((e as Error).name === "AbortError") throw e;
        throw new LookupError(`无法连接 AI 接口（${(e as Error).message}）；请检查 Base URL 与网络/跨域是否可用`);
      }
      const text = await res.text();
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = JSON.parse(text) as ChatResponse;
          if (err.error?.message) msg = err.error.message;
        } catch {
          /* ignore */
        }
        throw new LookupError(msg);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new LookupError("AI 接口返回的不是 JSON");
      }
      const content = (parsed as ChatResponse).choices?.[0]?.message?.content;
      if (!content) throw new LookupError("模型未返回内容");
      return content;
    } finally {
      done();
    }
  };

  if (opts.jsonMode === false) return attempt(false);
  try {
    return await attempt(true);
  } catch (e) {
    if (e instanceof LookupError && /response_format|json_object|400/i.test(e.message)) {
      return attempt(false);
    }
    throw e;
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
