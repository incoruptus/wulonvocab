import type { LookupDraft, SectionDef, SectionType } from "../types";
import { isPlainObject } from "../utils";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

/* ============================================================
   AI 检索适配器：任何 OpenAI 兼容接口（DeepSeek / OpenAI / Moonshot / 本地模型）
   按当前 Schema 动态生成提示词，输出可直接归一化的 JSON。
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

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export const aiAdapter: DictionaryAdapter = {
  kind: "ai",
  async lookup({ word, schema, config, signal }: LookupContext): Promise<LookupDraft> {
    const baseUrl = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
    const apiKey = (config.apiKey ?? "").trim();
    const model = (config.model ?? "").trim();
    if (!baseUrl) throw new LookupError("未配置 API Base URL");
    if (!model) throw new LookupError("未配置模型名称");
    const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const { system, user } = buildAiPrompt(word, schema, config.language || "中文", config.extraPrompt);

    const attempt = async (jsonMode: boolean): Promise<unknown> => {
      const { signal: s, done } = withTimeout(60000, signal);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: s,
        });
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
        return JSON.parse(text) as unknown;
      } finally {
        done();
      }
    };

    let raw: unknown;
    try {
      raw = await attempt(true);
    } catch (e) {
      if (e instanceof LookupError && /response_format|json_object|400/i.test(e.message)) {
        raw = await attempt(false);
      } else {
        throw e;
      }
    }

    const chat = raw as ChatResponse;
    const content = chat.choices?.[0]?.message?.content;
    if (!content) throw new LookupError("模型未返回内容");
    const jsonText = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const start = jsonText.indexOf("{");
      const end = jsonText.lastIndexOf("}");
      if (start >= 0 && end > start) parsed = JSON.parse(jsonText.slice(start, end + 1));
      else throw new LookupError("模型输出不是合法 JSON");
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
