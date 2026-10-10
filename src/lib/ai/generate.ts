import type { Schema } from "../types";
import { buildSchemaBrief, chatCompletion, extractJsonText, type ChatConfig } from "../lookup/ai";
import { LookupError } from "../lookup/types";
import { parseImportText, type ParsedImport } from "../importer";

/* ============================================================
   内置 AI 词表生成：按 WulonVocab Skill 规范构造提示词，
   让模型直接输出可导入的 JSON 文档（复用导入管线解析与容错）。
   ============================================================ */

export function buildGenerationPrompt(
  schema: Schema,
  request: string,
  options: { language?: string; count?: number } = {},
): { system: string; user: string } {
  const system = [
    "你是一位严谨的词典编纂助手，为 WulonVocab（本地优先单词本软件）生成可导入的 JSON 词表。",
    "输出规则：",
    "1. 只输出一个 JSON 对象，不要任何解释文字，不要 Markdown 代码块；",
    "2. 顶层结构固定为：",
    '{"format":"wulonvocab","version":1,"wordbook":{"name":"词库名","tags":["标签"]},"entries":[{"headword":"单词","tags":["标签"],"values":{}}]}',
    "3. entries[].values 的键必须使用下列字段键（键名需完全一致）：",
    buildSchemaBrief(schema),
    `4. 释义使用${options.language ?? "中文"}；词性用缩写（n. v. adj. adv. prep. conj. pron. num. int. 等）；`,
    "5. 例句要地道、长度适中，并为每条例句提供中文翻译；",
    "6. 只写你确定的内容，不确定的字段直接省略，不要编造；",
    `7. 单词不重复；数量按需求执行${options.count ? `（本次不超过 ${options.count} 个）` : "（默认不超过 30 个）"}。`,
  ].join("\n");
  const user = [`需求：${request}`, "请直接输出 JSON。"].join("\n");
  return { system, user };
}

export interface GenerateOptions {
  config: ChatConfig;
  schema: Schema;
  request: string;
  count?: number;
  signal?: AbortSignal;
}

/**
 * 调用内置 AI 生成词表：返回解析后的导入结构（与文件导入共用同一管线）。
 * 生成大词表时模型响应可能较慢，超时放宽到 120s。
 */
export async function generateWordbookJson(options: GenerateOptions): Promise<ParsedImport> {
  const { system, user } = buildGenerationPrompt(options.schema, options.request, { count: options.count });
  const content = await chatCompletion(
    options.config,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.35, jsonMode: true, signal: options.signal, timeoutMs: 120000 },
  );
  const jsonText = extractJsonText(content);
  let parsed: ParsedImport;
  try {
    parsed = parseImportText(jsonText, "ai-generated.json");
  } catch (e) {
    throw new LookupError(`生成结果解析失败：${(e as Error).message}`);
  }
  if (parsed.kind === "unknown" || !parsed.rows.length) {
    throw new LookupError(parsed.warnings.join("；") || "生成结果中没有可识别的词条");
  }
  return parsed;
}
