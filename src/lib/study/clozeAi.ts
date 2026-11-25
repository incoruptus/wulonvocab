import { createStore, del, get, keys, set } from "idb-keyval";
import type { Entry, Wordbook } from "../types";
import { chatCompletionMessage, type ChatConfig } from "../lookup/ai";
import { firstDefinition, firstTranslation } from "./quiz";
import { clozeFromExample, type ProductionQuestion } from "./production";

const cacheStore = createStore("wulonvocab-cloze-cache-v1", "kv");
const PREFIX = "cloze:";

function hash(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cacheKey(entry: Entry, config: ChatConfig): string {
  return `${PREFIX}${hash({
    word: entry.headword,
    translation: firstTranslation(entry)?.text,
    definition: firstDefinition(entry)?.text,
    baseUrl: config.baseUrl,
    model: config.model,
  })}`;
}

function parseQuestion(content: string, entry: Entry): ProductionQuestion | null {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const raw = JSON.parse(cleaned) as { en?: unknown; zh?: unknown };
    if (typeof raw.en !== "string") return null;
    return clozeFromExample(entry, { en: raw.en, zh: typeof raw.zh === "string" ? raw.zh : undefined });
  } catch {
    return null;
  }
}

/**
 * 仅在用户显式开启后调用。生成句通过同一 Cloze 准入规则，缓存命中不请求网络。
 * 缓存是设备本地资产，不进入主 store、同步或备份。
 */
export async function loadAiCloze(
  entry: Entry,
  _book: Wordbook,
  config: ChatConfig,
): Promise<{ question: ProductionQuestion; fromCache: boolean } | null> {
  const key = cacheKey(entry, config);
  const cached = await get<ProductionQuestion | null>(key, cacheStore);
  if (cached?.kind === "cloze" && cached.sentence) return { question: cached, fromCache: true };
  if (!config.baseUrl.trim() || !config.model.trim()) return null;

  const translation = firstTranslation(entry)?.text ?? "";
  const definition = firstDefinition(entry)?.text ?? "";
  const result = await chatCompletionMessage(config, [
    {
      role: "system",
      content: "你为单词学习卡片写一句原创英文例句。只输出 JSON，不要解释。句子必须自然、简短，最多 12 个英文单词，并且恰好包含目标词的原形一次。",
    },
    {
      role: "user",
      content: `目标词：${entry.headword}\n中文释义：${translation}\n英文释义：${definition}\n输出格式：{"en":"一句原创英文例句","zh":"对应中文翻译"}`,
    },
  ], { jsonMode: true, temperature: 0.3, timeoutMs: 20000 });
  const question = parseQuestion(result.content, entry);
  if (!question) return null;
  await set(key, question, cacheStore);
  return { question, fromCache: false };
}

export async function clearAiClozeCache(): Promise<void> {
  const all = await keys(cacheStore);
  await Promise.all(all.filter((key): key is string => typeof key === "string" && key.startsWith(PREFIX)).map((key) => del(key, cacheStore)));
}
