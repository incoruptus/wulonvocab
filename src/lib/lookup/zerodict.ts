import type { LookupDraft } from "../types";
import { normalizePos, sanitizeText } from "../sections";
import { uid } from "../utils";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

/**
 * 零配置网络综合词典（浏览器直连、无需 Key、无 CORS 问题）
 * - 英文骨架：freedictionaryapi.com（Wiktionary 派生：IPA / 释义 / 例句 / 近反义词 / 词形，CORS 开放）
 * - 中文翻译：api.mymemory.translated.net（en→zh 机器翻译，匿名配额约 5k 词/天）
 * 两者都允许跨域直连，因此用户在任意网络环境无需任何配置即可使用。
 */

const FD_API = "https://freedictionaryapi.com/api/v1/entries/en/";
const MM_API = "https://api.mymemory.translated.net/get";

interface FdPronunciation {
  type?: string;
  text?: string;
}
interface FdQuote {
  text?: string;
}
interface FdSense {
  definition?: string;
  examples?: string[];
  quotes?: FdQuote[];
  synonyms?: string[];
  antonyms?: string[];
}
interface FdForm {
  word?: string;
  tags?: string[];
}
interface FdEntry {
  partOfSpeech?: string;
  pronunciations?: FdPronunciation[];
  senses?: FdSense[];
  synonyms?: string[];
  antonyms?: string[];
  forms?: FdForm[];
}
interface FdResponse {
  word?: string;
  entries?: FdEntry[];
}

const FORM_TAG_LABELS: Record<string, string> = {
  comparative: "比较级",
  superlative: "最高级",
  plural: "复数",
  "third-person singular": "第三人称单数",
  "present participle": "现在分词",
  "simple past": "过去式",
  "past participle": "过去分词",
};

function stripTags(s: string): string {
  return s.replace(/<[^>]{0,80}>/g, "");
}

async function fetchEnglish(word: string, signal: AbortSignal): Promise<FdResponse> {
  const res = await fetch(`${FD_API}${encodeURIComponent(word)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new LookupError("该词典未收录此单词");
  if (!res.ok) throw new LookupError(`英文词典请求失败（HTTP ${res.status}）`);
  return (await res.json()) as FdResponse;
}

async function translateZh(text: string, signal: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`${MM_API}?q=${encodeURIComponent(text)}&langpair=en|zh-CN`, { signal });
    if (!res.ok) return [];
    const j = (await res.json()) as {
      responseData?: { translatedText?: string };
      matches?: { translation?: string }[];
      quotaFinished?: boolean;
    };
    if (j.quotaFinished) return [];
    const out: string[] = [];
    const push = (s?: string) => {
      const t = sanitizeText(s ?? "");
      if (t && !out.includes(t) && !/mymemory warning/i.test(t)) out.push(t);
    };
    push(j.responseData?.translatedText);
    for (const m of (j.matches ?? []).slice(0, 6)) push(m.translation);
    return out.slice(0, 3);
  } catch {
    return [];
  }
}

export const zeroDictAdapter: DictionaryAdapter = {
  kind: "zerodict",
  async lookup({ word, signal }: LookupContext): Promise<LookupDraft> {
    const { signal: s, done } = withTimeout(25000, signal);
    try {
      const [en, zh] = await Promise.all([fetchEnglish(word, s), translateZh(word, s)]);
      const entries = en.entries ?? [];
      if (!entries.length) throw new LookupError("未找到结果");

      const values: Record<string, unknown> = {};

      const ipa = entries.flatMap((e) => e.pronunciations ?? []).find((p) => p.text)?.text;
      if (ipa) {
        const t = sanitizeText(ipa);
        values.phonetic = { uk: /^[/[]/.test(t) ? t : `/${t}/` };
      }

      const senses: Record<string, unknown>[] = [];
      const posSet = new Set<string>();
      let transforms: { form: string; pos: string; note: string }[] | undefined;

      entries.forEach((entry, ei) => {
        const pos = entry.partOfSpeech ? normalizePos(entry.partOfSpeech) : "";
        if (pos) posSet.add(pos);

        const forms = (entry.forms ?? []).filter((f) => f.word);
        if (forms.length && !transforms) {
          transforms = forms.slice(0, 8).map((f) => ({
            form: String(f.word),
            pos: "",
            note: (f.tags ?? []).map((t) => FORM_TAG_LABELS[t] ?? t).join(" / "),
          }));
        }

        (entry.senses ?? []).forEach((sn, si) => {
          const definition = sanitizeText(sn.definition ?? "");
          if (!definition) return;
          const examples = [
            ...(sn.examples ?? []).map((x) => ({ en: stripTags(String(x)) })),
            ...(sn.quotes ?? []).map((q) => ({ en: sanitizeText(stripTags(q.text ?? "")) })),
          ]
            .filter((x) => x.en)
            .slice(0, 3);
          const sense: Record<string, unknown> = {
            id: uid(),
            pos,
            translation: "",
            definition,
            examples,
            usage: "",
            patterns: [],
            synonyms: [...new Set([...(sn.synonyms ?? []), ...(ei === 0 && si === 0 ? (entry.synonyms ?? []) : [])])].slice(0, 10),
            antonyms: [...new Set(sn.antonyms ?? [])].slice(0, 10),
            collocations: [],
            notes: "",
          };
          // 中文翻译：仅对第一个义项调用一次机器翻译（配额友好），其余可后续在编辑器补充
          if (ei === 0 && si === 0 && zh.length) {
            sense.translation = zh[0];
            if (zh.length > 1) sense.notes = `其他译法：${zh.slice(1).join(" / ")}`;
          }
          senses.push(sense);
        });
      });

      if (senses.length) values.senses = senses;
      if (transforms?.length) values.transforms = transforms;
      if (!Object.keys(values).length) throw new LookupError("未解析出可用内容");

      return {
        values,
        summary: {
          headword: word,
          phonetic: ipa ? sanitizeText(ipa) : undefined,
          posList: [...posSet],
          definitions: senses.slice(0, 3).map((x) => String((x as { definition?: string }).definition ?? "")),
        },
        suggestedTags: ["网络词典"],
      };
    } finally {
      done();
    }
  },
};
