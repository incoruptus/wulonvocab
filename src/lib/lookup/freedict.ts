import type { LookupDraft } from "../types";
import { normalizePos, sanitizeText } from "../sections";
import { uid } from "../utils";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

const API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

interface FreePhonetic {
  text?: string;
  audio?: string;
}
interface FreeDefinition {
  definition?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}
interface FreeMeaning {
  partOfSpeech?: string;
  definitions?: FreeDefinition[];
  synonyms?: string[];
  antonyms?: string[];
}
interface FreeEntry {
  word?: string;
  phonetic?: string;
  phonetics?: FreePhonetic[];
  meanings?: FreeMeaning[];
  origin?: string;
  sourceUrls?: string[];
}

export function mapFreeDict(data: FreeEntry[], word: string): LookupDraft {
  const first = data[0] ?? {};
  const values: Record<string, unknown> = {};
  const phonetics = (first.phonetics ?? []).filter((p) => p.text || p.audio);
  const pick = (re: RegExp) => phonetics.find((p) => p.audio && re.test(p.audio));
  const uk = pick(/-uk\./) ?? phonetics.find((p) => p.text && !p.audio);
  const us = pick(/-us\./) ?? pick(/-au\./);
  const phonetic: Record<string, string> = {};
  const ukText = uk?.text || uk?.audio?.match(/-uk\./)?.[0];
  const usText = us?.text;
  const ukVal = uk?.text || first.phonetic;
  if (ukVal) phonetic.uk = ensureSlashes(ukVal);
  if (usText) phonetic.us = ensureSlashes(usText);
  if (uk?.audio) phonetic.audioUk = uk.audio;
  if (us?.audio) phonetic.audioUs = us.audio;
  if (Object.keys(phonetic).length) values.phonetic = phonetic;

  const senses: Record<string, unknown>[] = [];
  const posSet = new Set<string>();
  for (const entry of data) {
    for (const meaning of entry.meanings ?? []) {
      const pos = meaning.partOfSpeech ? normalizePos(meaning.partOfSpeech) : "";
      if (pos) posSet.add(pos);
      for (const def of meaning.definitions ?? []) {
        if (!def.definition) continue;
        senses.push({
          id: uid(),
          pos,
          translation: "",
          definition: sanitizeText(def.definition),
          examples: def.example ? [{ en: sanitizeText(def.example) }] : [],
          usage: "",
          patterns: [],
          synonyms: dedupe([...(def.synonyms ?? []), ...(meaning.synonyms ?? [])]).slice(0, 12),
          antonyms: dedupe([...(def.antonyms ?? []), ...(meaning.antonyms ?? [])]).slice(0, 12),
          collocations: [],
          notes: "",
        });
      }
    }
  }
  if (senses.length) values.senses = senses;

  const origin = sanitizeText(first.origin ?? "");
  if (origin) values.etymology = origin;

  return {
    values,
    suggestedTags: ["Free Dictionary"],
    summary: {
      headword: word,
      phonetic: ukVal ? ensureSlashes(ukVal) : ukText || undefined,
      posList: [...posSet],
      definitions: senses.slice(0, 3).map((s) => String(s.definition)),
    },
    rawInfo: { sourceUrls: first.sourceUrls ?? [] },
  } as LookupDraft & { rawInfo: unknown };
}

function ensureSlashes(s: string): string {
  const t = sanitizeText(s);
  if (!t) return "";
  return /^[/[]/.test(t) ? t : `/${t}/`;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

export const freeDictAdapter: DictionaryAdapter = {
  kind: "freedict",
  async lookup({ word, signal }: LookupContext): Promise<LookupDraft> {
    const { signal: s, done } = withTimeout(10000, signal);
    try {
      const res = await fetch(`${API}${encodeURIComponent(word)}`, { signal: s });
      if (res.status === 404) throw new LookupError("该词典未收录此单词");
      if (!res.ok) throw new LookupError(`请求失败（HTTP ${res.status}）`);
      const data = (await res.json()) as unknown;
      const entries = Array.isArray(data) ? (data as FreeEntry[]) : [data as FreeEntry];
      if (!entries.length) throw new LookupError("未找到结果");
      return mapFreeDict(entries, word);
    } finally {
      done();
    }
  },
};
