import type {
  AccentId,
  ExampleItem,
  ImageValue,
  KeyValueItem,
  PronunciationValue,
  RatingValue,
  SectionDef,
  SectionOptions,
  SectionType,
  SenseItem,
  TableValue,
  TransformItem,
} from "./types";
import { isPlainObject, uid, uniqueKey } from "./utils";

/* ============================================================
   文本清洗与容错归一化工具
   ============================================================ */

export function sanitizeText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, "$1")
    .replace(/\[sound:[^\]]*\]/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]{0,240}>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\u3000]+$/gm, "")
    .trim();
}

export function canonicalKey(k: string): string {
  return k.toLowerCase().replace(/[\s_\-·（）()]+/g, "");
}

/** 大小写/分隔符不敏感的键取值 */
export function pickKey(obj: Record<string, unknown>, keys: string[]): unknown {
  const wanted = new Set(keys.map(canonicalKey));
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (wanted.has(canonicalKey(k))) return v;
  }
  return undefined;
}

export function valueToText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return sanitizeText(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(valueToText).filter(Boolean).join("\n");
  if (isPlainObject(v)) {
    const inner = pickKey(v, ["text", "value", "zh", "meaning", "translation", "definition", "en", "name"]);
    if (inner != null && inner !== v) return valueToText(inner);
    return "";
  }
  return "";
}

export function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  return valueToText(pickKey(obj, keys));
}

const ENUM_RE =
  /(^|[\n\s])(?:[①-⑳]|\(\d{1,2}\)|\d{1,2}[.、)）]|[a-zA-Z][)）]|[•·–—]\s+)\s*/g;

/** 将内联枚举（①… ②… / 1. … 2. … / • …）拆分为多条 */
export function splitEnumeration(s: string): string[] {
  const str = s.trim();
  if (!str) return [];
  const matches = [...str.matchAll(ENUM_RE)];
  if (matches.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i];
      if (m.index == null) continue;
      const start = m.index + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? str.length) : str.length;
      const part = str.slice(start, end).trim();
      if (part) parts.push(part);
    }
    if (parts.length >= 2) return parts;
  }
  return [str];
}

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const k = item.trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(k);
  }
  return out;
}

/** 通用字符串列表归一化：接受 string / string[] / object / object[] */
export function strList(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "number") {
      out.push(String(v));
      return;
    }
    if (typeof v === "string") {
      const s = sanitizeText(v);
      if (!s) return;
      for (const line of s.split(/\r?\n|[;；]|(?:\s*\|\s*)/)) {
        const t = line.trim().replace(/^[•·\-–—*]\s*/, "");
        if (t) out.push(t);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(push);
      return;
    }
    if (isPlainObject(v)) {
      for (const k of ["text", "value", "name", "word", "term", "phrase", "title", "zh", "en", "meaning", "note", "content", "form", "chunk"]) {
        const got = pickKey(v, [k]);
        if (got != null && typeof got !== "object") {
          const t = sanitizeText(String(got));
          if (t) {
            out.push(t);
            return;
          }
        }
      }
      const joined = Object.entries(v)
        .map(([k, val]) => {
          const t = valueToText(val);
          return t ? `${k}：${t}` : k;
        })
        .join("；");
      if (joined) out.push(joined);
    }
  };
  if (isPlainObject(raw) && Object.values(raw).every((v) => !Array.isArray(v) && !isPlainObject(v))) {
    // 对象中带有常见的「文本键」时直接取该值（如 { text: "hello" }）
    const primary = pickKey(raw, ["text", "value", "content", "name", "title", "zh", "en", "meaning", "word"]);
    if (primary != null && typeof primary !== "object") {
      const t = sanitizeText(String(primary));
      if (t) return dedupe([t]);
    }
    for (const [k, v] of Object.entries(raw)) {
      const t = valueToText(v);
      out.push(t ? `${k} ${t}` : k);
    }
    return dedupe(out);
  }
  push(raw);
  return dedupe(out);
}

const WORD_LIST_SPLIT_RE = /[\n\r,，;；、/|]+/;

/** 近义词/反义词/搭配：逗号、分号、顿号、斜杠皆可分隔 */
export function normalizeWordList(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "number") {
      out.push(String(v));
      return;
    }
    if (typeof v === "string") {
      const s = sanitizeText(v).replace(/^(syn|ant|近义词|反义词|同义词|反义|搭配|词组)\s*[:：.]?\s*/i, "");
      if (!s) return;
      s.split(WORD_LIST_SPLIT_RE).forEach((t) => {
        const v2 = t.trim().replace(/^(syn|ant)\.\s*/i, "");
        if (v2) out.push(v2);
      });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(push);
      return;
    }
    if (isPlainObject(v)) {
      const word = pickStr(v, ["word", "text", "value", "form", "term", "chunk", "en", "name"]);
      const note = pickStr(v, ["note", "note_cn", "meaning", "translation", "zh", "备注"]);
      if (word) out.push(note ? `${word}（${note}）` : word);
    }
  };
  push(raw);
  return dedupe(out);
}

/* ============================================================
   词性处理
   ============================================================ */

export const COMMON_POS = [
  "n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "art.", "int.",
  "aux.", "vt.", "vi.", "det.", "abbr.", "phr.", "phr v.", "modal",
] as const;

const POS_ALIAS: Record<string, string> = {
  n: "n.", noun: "n.", 名词: "n.",
  v: "v.", verb: "v.", 动词: "v.",
  vt: "vt.", "v.t": "vt.", transitive: "vt.", 及物动词: "vt.",
  vi: "vi.", "v.i": "vi.", intransitive: "vi.", 不及物动词: "vi.",
  adj: "adj.", adjective: "adj.", 形容词: "adj.",
  adv: "adv.", adverb: "adv.", 副词: "adv.",
  prep: "prep.", preposition: "prep.", 介词: "prep.",
  conj: "conj.", conjunction: "conj.", 连词: "conj.",
  pron: "pron.", pronoun: "pron.", 代词: "pron.",
  num: "num.", numeral: "num.", 数词: "num.",
  art: "art.", article: "art.", 冠词: "art.",
  int: "int.", interj: "int.", interjection: "int.", 感叹词: "int.",
  aux: "aux.", auxiliary: "aux.", 助动词: "aux.",
  det: "det.", determiner: "det.", 限定词: "det.",
  abbr: "abbr.", abbreviation: "abbr.", 缩写: "abbr.",
  phr: "phr.", phrase: "phr.", 短语: "phr.",
  modal: "modal", 情态动词: "modal",
  "phr v": "phr v.", "phrasal verb": "phr v.", 动词短语: "phr v.",
};

export function normalizePos(raw: string): string {
  const s = sanitizeText(raw);
  if (!s) return "";
  const bare = s.replace(/[.。]/g, "").trim().toLowerCase();
  if (POS_ALIAS[bare]) return POS_ALIAS[bare];
  if (/^[a-zA-Z]{1,10}$/.test(bare)) return `${bare}.`;
  return s;
}

export function parsePosPrefix(raw: string): { pos?: string; rest: string } {
  const s = raw.trim();
  const m = s.match(/^([A-Za-z]{1,12}(?:\.[A-Za-z]+)*)(\.)?[\s:：]+([\s\S]*)$/);
  if (m && m[3].trim()) {
    const bare = m[1].toLowerCase();
    const known = POS_ALIAS[bare] ?? (m[2] || POS_ALIAS[bare] ? POS_ALIAS[bare] : undefined);
    if (known) return { pos: known, rest: m[3].trim() };
  }
  const m2 = s.match(/^([A-Za-z]{1,12})\.\s*([\s\S]+)$/);
  if (m2 && POS_ALIAS[m2[1].toLowerCase()]) {
    return { pos: POS_ALIAS[m2[1].toLowerCase()], rest: m2[2].trim() };
  }
  const m3 = s.match(/^([\u4e00-\u9fff]{1,6}词)\s*[:：]?\s*([\s\S]+)$/);
  if (m3 && POS_ALIAS[m3[1]]) return { pos: POS_ALIAS[m3[1]], rest: m3[2].trim() };
  return { rest: s };
}

/* ============================================================
   各字段类型的归一化
   ============================================================ */

export function normalizePronunciation(raw: unknown): PronunciationValue {
  const ensure = (s: string) => {
    const t = sanitizeText(s);
    if (!t) return "";
    if (/^[\/\[]/.test(t)) return t;
    return `/${t}/`;
  };
  if (raw == null) return {};
  if (typeof raw === "string") {
    const t = ensure(raw);
    return t ? { uk: t } : {};
  }
  if (Array.isArray(raw)) {
    const [a, b] = raw.map((x) => (typeof x === "string" ? x : ""));
    const out: PronunciationValue = {};
    if (a) out.uk = ensure(a);
    if (b) out.us = ensure(b);
    return out;
  }
  if (isPlainObject(raw)) {
    const out: PronunciationValue = {};
    const uk = pickStr(raw, ["uk", "bre", "british", "英", "ukphonetic", "phonetic", "brephonetic"]);
    const us = pickStr(raw, ["us", "ame", "american", "美", "usphonetic", "amephonetic", "name"]);
    if (uk) out.uk = ensure(uk);
    if (us) out.us = ensure(us);
    const audioUk = pickStr(raw, ["audiouk", "ukaudio", "audio", "uk"]);
    const audioUs = pickStr(raw, ["audious", "usaudio", "americasaudio"]);
    if (audioUk && /\.(mp3|m4a|wav|ogg)|^https?:|^data:/.test(audioUk)) out.audioUk = audioUk;
    if (audioUs && /\.(mp3|m4a|wav|ogg)|^https?:|^data:/.test(audioUs)) out.audioUs = audioUs;
    return out;
  }
  return {};
}

export function splitBilingual(s: string): { en: string; zh?: string } {
  const str = sanitizeText(s);
  if (!str) return { en: "" };
  const idx = str.search(/[\u4e00-\u9fff\u3400-\u4dbf]/);
  if (idx <= 0) return { en: str };
  const en = str.slice(0, idx).replace(/[\s,;，；:：\-–—]+$/, "").trim();
  const zh = str.slice(idx).trim();
  return { en, zh: zh || undefined };
}

export function exampleFromString(s: string): ExampleItem | null {
  const { en, zh } = splitBilingual(s);
  const sourceMatch = en.match(/[（(]([^（）()]{1,32})[）)]\s*$/);
  let src: string | undefined;
  let cleanEn = en;
  if (sourceMatch && /20\d\d|真题|牛津|OALD|TED|考研|高考|四级|六级/i.test(sourceMatch[1])) {
    src = sourceMatch[1].trim();
    cleanEn = en.slice(0, sourceMatch.index).trim();
  }
  if (!cleanEn && !zh) return null;
  return { en: cleanEn || zh || "", zh, source: src };
}

export function normalizeExamples(raw: unknown): ExampleItem[] {
  const out: ExampleItem[] = [];
  const push = (item: unknown) => {
    if (item == null) return;
    if (typeof item === "string" || typeof item === "number") {
      const e = exampleFromString(String(item));
      if (e) out.push(e);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length > 0 && item.length <= 3 && item.every((x) => typeof x === "string")) {
        const [en, zh, source] = item as string[];
        const parsed = splitBilingual(en);
        out.push({ en: parsed.en || en, zh: zh ? sanitizeText(zh) : parsed.zh, source: source ? sanitizeText(source) : undefined });
        return;
      }
      item.forEach(push);
      return;
    }
    if (isPlainObject(item)) {
      const en = pickStr(item, ["en", "example", "text", "sentence", "english", "sent", "例句", "英", "content"]);
      const zh = pickStr(item, ["zh", "cn", "translation", "trans", "meaning", "chinese", "翻译", "中文"]);
      const source = pickStr(item, ["source", "from", "ref", "来源", "出处", "note"]);
      if (!en && zh) {
        const parsed = splitBilingual(zh);
        if (parsed.zh || parsed.en) {
          out.push({ en: parsed.en || parsed.zh || "", zh: parsed.zh ? parsed.en : undefined, source: source || undefined });
          return;
        }
      }
      if (en || zh) out.push({ en: en || zh || "", zh: zh || undefined, source: source || undefined });
    }
  };
  push(raw);
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.en}||${e.zh ?? ""}`.toLowerCase();
    if (!e.en || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function normalizeSenseItem(raw: unknown, inheritedPos = ""): SenseItem | null {
  const base = (): SenseItem => ({
    id: uid(),
    pos: inheritedPos,
    translation: "",
    definition: "",
    examples: [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  });
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    const s = sanitizeText(String(raw));
    if (!s) return null;
    const { pos, rest } = parsePosPrefix(s);
    const item = base();
    item.pos = pos ?? inheritedPos;
    item.translation = rest;
    return item;
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => valueToText(x)).filter(Boolean);
    if (!parts.length) return null;
    const item = base();
    item.translation = parts.join("\n");
    return item;
  }
  if (!isPlainObject(raw)) return null;
  const item = base();
  const posRaw = pickStr(raw, ["pos", "partofspeech", "pos_tag", "wordclass", "type", "词性", "标签"]);
  item.pos = posRaw ? normalizePos(posRaw) : inheritedPos;
  item.translation = pickStr(raw, ["translation", "zh", "cn", "chinese", "meaning", "mean", "trans", "tran", "翻译", "释义", "中文", "意义"]);
  item.definition = pickStr(raw, ["definition", "def", "english", "meaningen", "definitionen", "en", "英文释义", "英释"]);
  item.usage = pickStr(raw, ["usage", "use", "usagenote", "用法", "用法说明", "说明"]);
  item.notes = pickStr(raw, ["notes", "note", "remark", "remarks", "memo", "备注", "注意", "提示"]);
  item.patterns = strList(pickKey(raw, ["patterns", "pattern", "frames", "structures", "sentencepatterns", "句型", "句式"]));
  item.synonyms = normalizeWordList(pickKey(raw, ["synonyms", "syn", "synonym", "近义词", "同义词"]));
  item.antonyms = normalizeWordList(pickKey(raw, ["antonyms", "ant", "antonym", "反义词"]));
  item.collocations = normalizeWordList(pickKey(raw, ["collocations", "collocation", "collo", "chunks", "搭配", "词组", "固定搭配"]));
  const exRaw = pickKey(raw, ["examples", "example", "ex", "sents", "sentences", "例句", "example_sentences"]);
  if (exRaw != null) item.examples = normalizeExamples(exRaw);
  if (!item.pos && posRaw) item.pos = normalizePos(posRaw);
  return item;
}

/** 词性分组/命名空间对象检测：{v:[...], n:[...]} */
function isPosKeyedMap(obj: Record<string, unknown>): boolean {
  const entries = Object.entries(obj);
  if (!entries.length) return false;
  return entries.every(([k, v]) => {
    if (!Array.isArray(v)) return false;
    const bare = canonicalKey(k);
    return Boolean(POS_ALIAS[bare] || POS_ALIAS[bare.replace(/\.$/, "")]);
  });
}

function hasOwnSenseContent(obj: Record<string, unknown>): boolean {
  return Boolean(
    pickStr(obj, ["translation", "zh", "cn", "chinese", "meaning", "mean", "定义", "释义", "definition", "def", "english"]) ||
      pickKey(obj, ["examples", "example", "ex", "例句"]),
  );
}

export function normalizeSenses(raw: unknown): SenseItem[] {
  const out: SenseItem[] = [];
  const pushItem = (item: unknown, inheritedPos = "") => {
    if (item == null) return;
    if (Array.isArray(item)) {
      item.forEach((x) => pushItem(x, inheritedPos));
      return;
    }
    if (isPlainObject(item)) {
      // 平行数组优先：definitions[] + translations[] 逐项配对
      const defsArr = pickKey(item, ["definitions", "defs"]);
      const transArr = pickKey(item, ["translations", "zhs", "中文释义"]);
      if (Array.isArray(defsArr) && Array.isArray(transArr)) {
        const posStr0 = pickStr(item, ["pos", "partofspeech", "pos_tag", "wordclass", "type", "词性"]);
        const pos0 = posStr0 ? normalizePos(posStr0) : inheritedPos;
        const n = Math.min(defsArr.length, transArr.length);
        for (let i = 0; i < n; i += 1) {
          const s = base_pair(defsArr[i], transArr[i], pos0);
          if (s) out.push(s);
        }
        const longer = defsArr.length > transArr.length ? defsArr : transArr;
        for (let i = n; i < longer.length; i += 1) {
          const s = defsArr.length > transArr.length ? base_pair(defsArr[i], "", pos0) : base_pair("", transArr[i], pos0);
          if (s) out.push(s);
        }
        return;
      }
      const childrenKeys = ["senses", "definitions", "meanings", "items", "entries", "释义", "义项"];
      let children: unknown[] | undefined;
      for (const k of childrenKeys) {
        const v = pickKey(item, [k]);
        if (Array.isArray(v) && v.length) {
          children = v;
          break;
        }
      }
      const own = hasOwnSenseContent(item);
      const posStr = pickStr(item, ["pos", "partofspeech", "pos_tag", "wordclass", "type", "词性"]);
      const pos = posStr ? normalizePos(posStr) : inheritedPos;
      if (children && !own) {
        children.forEach((c) => pushItem(c, pos || inheritedPos));
        return;
      }
      if (children && own) {
        const s = normalizeSenseItem({ ...item, senses: undefined }, inheritedPos);
        if (s) out.push(s);
        children.forEach((c) => pushItem(c, (s?.pos || pos) ?? inheritedPos));
        return;
      }
      if (isPosKeyedMap(item)) {
        for (const [k, v] of Object.entries(item)) {
          const p = normalizePos(k);
          (v as unknown[]).forEach((c) => pushItem(c, p));
        }
        return;
      }
      const s = normalizeSenseItem(item, inheritedPos);
      if (!s) return;
      // 内联枚举拆分："① …… ② ……"
      if (s.translation && !s.definition) {
        const parts = splitEnumeration(s.translation);
        if (parts.length >= 2) {
          parts.forEach((p) => {
            const copy: SenseItem = { ...s, id: uid(), translation: p };
            copy.examples = parts.length > 1 ? [] : s.examples;
            out.push(copy);
          });
          if (s.examples.length) out[out.length - parts.length].examples = s.examples;
          return;
        }
      }
      out.push(s);
      return;
    }
    const s = normalizeSenseItem(item, inheritedPos);
    if (s) out.push(s);
  };
  const base_pair = (def: unknown, trans: unknown, pos: string): SenseItem | null => {
    const d = valueToText(def);
    const t = valueToText(trans);
    if (!d && !t) return null;
    const s = normalizeSenseItem({}, pos);
    if (!s) return null;
    s.definition = d;
    s.translation = t;
    return s;
  };
  pushItem(raw);
  return out;
}

export function normalizeKeyValue(raw: unknown): KeyValueItem[] {
  const out: KeyValueItem[] = [];
  const splitKV = (s: string): KeyValueItem => {
    const str = sanitizeText(s);
    const m = str.match(/^(.+?)\s*[:：|｜—–]\s*(.+)$/) ?? str.match(/^(\S+)\s+([\s\S]+)$/);
    if (m) return { key: m[1].trim(), value: m[2].trim() };
    return { key: str, value: "" };
  };
  const push = (item: unknown) => {
    if (item == null) return;
    if (typeof item === "string" || typeof item === "number") {
      const s = sanitizeText(String(item));
      if (s) out.push(splitKV(s));
      return;
    }
    if (Array.isArray(item)) {
      if (item.length === 2 && !Array.isArray(item[0]) && !isPlainObject(item[0]) && !Array.isArray(item[1]) && !isPlainObject(item[1])) {
        out.push({ key: valueToText(item[0]), value: valueToText(item[1]) });
        return;
      }
      item.forEach(push);
      return;
    }
    if (isPlainObject(item)) {
      const key = pickStr(item, ["key", "word", "term", "k", "name", "form", "w", "词", "派生词", "单词"]);
      const value = pickStr(item, ["value", "meaning", "def", "definition", "translation", "zh", "v", "释义", "意思", "含义"]);
      if (key) {
        out.push({ key, value });
        return;
      }
      if (Object.values(item).every((v) => !Array.isArray(v) && !isPlainObject(v))) {
        for (const [k, v] of Object.entries(item)) out.push({ key: k, value: valueToText(v) });
      }
    }
  };
  if (isPlainObject(raw)) {
    const entries = Object.entries(raw);
    if (entries.length && entries.every(([, v]) => !Array.isArray(v))) {
      for (const [k, v] of entries) {
        if (isPlainObject(v)) {
          const kv = v as Record<string, unknown>;
          out.push({ key: k, value: valueToText(pickKey(kv, ["translation", "meaning", "zh", "def", "definition", "value"]) ) });
        } else {
          out.push({ key: k, value: valueToText(v) });
        }
      }
      return out.filter((x) => x.key);
    }
  }
  push(raw);
  return out.filter((x) => x.key || x.value);
}

const FORM_LABELS: Record<string, string> = {
  past: "过去式", pasttense: "过去式", p: "过去式",
  pastparticiple: "过去分词", ppl: "过去分词", d: "过去分词",
  presentparticiple: "现在分词", ing: "现在分词", i: "现在分词",
  thirdperson: "第三人称单数", third: "第三人称单数", s3: "第三人称单数", "3": "第三人称单数",
  plural: "复数", s: "复数",
  comparative: "比较级", r: "比较级",
  superlative: "最高级", t: "最高级",
  lemma: "原形", "0": "原型",
  "1": "原型变换",
};

export function normalizeTransforms(raw: unknown): TransformItem[] {
  const out: TransformItem[] = [];
  const push = (item: unknown) => {
    if (item == null) return;
    if (typeof item === "string") {
      const s = sanitizeText(item);
      if (!s) return;
      const mParen = s.match(/^(.+?)\s*[（(]\s*([^）)]{1,16})\s*[）)]\s*$/);
      if (mParen) {
        const inner = mParen[2].trim();
        const bare = canonicalKey(inner).replace(/\.$/, "");
        const pos = POS_ALIAS[bare];
        if (pos) {
          out.push({ form: mParen[1].trim(), pos });
        } else {
          out.push({ form: mParen[1].trim(), note: inner });
        }
        return;
      }
      const { pos, rest } = parsePosPrefix(s);
      if (pos && rest) {
        out.push({ form: rest, pos });
        return;
      }
      const m2 = s.match(/^([^:：]{1,14})[:：]\s*(.+)$/);
      if (m2) {
        out.push({ form: m2[2].trim(), pos: "", note: m2[1].trim() });
        return;
      }
      out.push({ form: s });
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(push);
      return;
    }
    if (isPlainObject(item)) {
      const form = pickStr(item, ["form", "word", "value", "v", "形式", "变形"]);
      const posStr = pickStr(item, ["pos", "partofspeech", "type", "词性"]);
      const note = pickStr(item, ["note", "label", "说明", "备注", "tense"]);
      if (form || posStr || note) {
        out.push({ form, pos: posStr ? normalizePos(posStr) : "", note: note || undefined });
      }
    }
  };
  if (isPlainObject(raw) && !pickStr(raw, ["form", "word", "value"])) {
    for (const [k, v] of Object.entries(raw)) {
      const bare = canonicalKey(k);
      if (typeof v === "string") {
        const pos = POS_ALIAS[bare];
        out.push({ form: sanitizeText(v), pos: pos ?? "", note: pos ? undefined : (FORM_LABELS[bare] ?? k) });
      } else {
        push(v);
      }
    }
    return out.filter((x) => x.form || x.pos);
  }
  push(raw);
  return out.filter((x) => x.form || x.pos);
}

export function normalizeTable(raw: unknown): TableValue {
  const toRow = (row: unknown, columns: string[]): string[] => {
    if (Array.isArray(row)) return row.map((c) => valueToText(c));
    if (isPlainObject(row)) return columns.map((c) => valueToText((row as Record<string, unknown>)[c] ?? pickKey(row, [c])));
    return [valueToText(row)];
  };
  if (isPlainObject(raw)) {
    const columnsRaw = pickKey(raw, ["columns", "header", "headers", "列", "表头"]);
    const columns = strList(columnsRaw);
    const rowsRaw = pickKey(raw, ["rows", "data", "body", "行", "数据"]);
    if (Array.isArray(rowsRaw)) {
      const rows = rowsRaw.map((r) => toRow(r, columns));
      const width = Math.max(columns.length, ...rows.map((r) => r.length), 1);
      const cols = columns.length ? columns : Array.from({ length: width }, (_, i) => `列 ${i + 1}`);
      return { columns: cols, rows: rows.map((r) => padRow(r, cols.length)) };
    }
    return { columns: columns.length ? columns : ["列 1", "列 2"], rows: [] };
  }
  if (Array.isArray(raw)) {
    if (raw.length && raw.every((r) => isPlainObject(r))) {
      const cols: string[] = [];
      for (const row of raw as Record<string, unknown>[]) {
        for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
      }
      return { columns: cols, rows: raw.map((r) => cols.map((c) => valueToText((r as Record<string, unknown>)[c]))) };
    }
    const arr = raw.map((r) => (Array.isArray(r) ? r.map((c) => valueToText(c)) : [valueToText(r)]));
    if (arr.length) {
      const width = Math.max(...arr.map((r) => r.length));
      const head = padRow(arr[0], width);
      return { columns: head, rows: arr.slice(1).map((r) => padRow(r, width)) };
    }
  }
  return { columns: ["列 1", "列 2"], rows: [] };
}

function padRow(row: string[], width: number): string[] {
  const out = row.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}

export function normalizeImages(raw: unknown): ImageValue[] {
  const out: ImageValue[] = [];
  const push = (item: unknown) => {
    if (item == null) return;
    if (typeof item === "string") {
      const s = sanitizeText(item);
      const md = s.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
      if (md) {
        out.push({ url: md[1] });
        return;
      }
      if (s) out.push({ url: s });
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(push);
      return;
    }
    if (isPlainObject(item)) {
      const url = pickStr(item, ["url", "src", "href", "image", "link", "图片"]);
      const caption = pickStr(item, ["caption", "title", "alt", "desc", "说明", "标题"]);
      if (url) out.push({ url, caption: caption || undefined });
    }
  };
  push(raw);
  return out.filter((i) => i.url);
}

export function normalizeRating(raw: unknown): RatingValue {
  if (typeof raw === "number") return { value: Math.max(0, Math.round(raw)), max: 5 };
  if (typeof raw === "string") {
    const stars = (raw.match(/[★⭐]/g) ?? []).length;
    if (stars) return { value: Math.min(5, stars), max: 5 };
    // 常见「x/y」写法：按分数解析（"4/5"→4；"3.5/5"→4；max 跟随分母），而非去符号拼数字
    const frac = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (frac) {
      const v = Number(frac[1]);
      const m = Number(frac[2]);
      if (!Number.isNaN(v) && !Number.isNaN(m) && m > 0) {
        const max = Math.max(1, Math.round(m));
        return { value: Math.max(0, Math.min(max, Math.round(v))), max };
      }
    }
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (!Number.isNaN(n)) return { value: Math.max(0, Math.round(n)), max: 5 };
  }
  if (isPlainObject(raw)) {
    const value = pickKey(raw, ["value", "rating", "score", "level", "掌握度", "值"]);
    const max = pickKey(raw, ["max", "total", "outof"]);
    const label = pickStr(raw, ["label", "name", "标签"]);
    const num = typeof value === "number" ? value : Number(valueToText(value).replace(/[^\d.]/g, ""));
    return {
      value: Number.isNaN(num) ? 0 : Math.round(num),
      max: typeof max === "number" ? max : Number(max) || 5,
      label: label || undefined,
    };
  }
  return { value: 0, max: 5 };
}

/* ============================================================
   字段类型注册表
   ============================================================ */

export interface OptionFieldDef {
  key: keyof SectionOptions & string;
  label: string;
  kind: "switch" | "text" | "number" | "select";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  hint?: string;
}

export interface SectionTypeDef {
  type: SectionType;
  label: string;
  icon: string;
  hint: string;
  repeatable: boolean;
  splittable: boolean;
  itemLabel?: string;
  placeholder?: string;
  defaults: SectionOptions;
  optionFields: OptionFieldDef[];
  normalize: (raw: unknown) => unknown;
  empty: () => unknown;
}

const ACCENT_OPTIONS = [
  { value: "blue", label: "Geist 蓝" },
  { value: "violet", label: "紫罗兰" },
  { value: "teal", label: "青碧" },
  { value: "amber", label: "琥珀" },
  { value: "rose", label: "玫瑰" },
  { value: "green", label: "松绿" },
  { value: "gray", label: "石墨" },
];

export const SECTIONS: Record<SectionType, SectionTypeDef> = {
  text: {
    type: "text",
    label: "短文本",
    icon: "Type",
    hint: "单行内容，如词源、记忆口诀、一句话备注",
    repeatable: false,
    splittable: false,
    placeholder: "输入内容…",
    defaults: { prefix: "" },
    optionFields: [{ key: "prefix", label: "行内前缀", kind: "text" }],
    normalize: (raw) => valueToText(raw),
    empty: () => "",
  },
  markdown: {
    type: "markdown",
    label: "长文本 / Markdown",
    icon: "AlignLeft",
    hint: "多行笔记，支持 **加粗**、*斜体*、`代码`、==高亮==、列表",
    repeatable: false,
    splittable: false,
    placeholder: "支持 Markdown：**加粗**、*斜体*、`代码`、==高亮==、- 列表",
    defaults: {},
    optionFields: [],
    normalize: (raw) => valueToText(raw),
    empty: () => "",
  },
  list: {
    type: "list",
    label: "列表",
    icon: "List",
    hint: "多条短句，如联想、词根解析、常用搭配",
    repeatable: true,
    splittable: true,
    itemLabel: "条",
    placeholder: "添加一条…",
    defaults: { ordered: false },
    optionFields: [{ key: "ordered", label: "编号显示", kind: "switch" }],
    normalize: (raw) => strList(raw),
    empty: () => [] as string[],
  },
  tags: {
    type: "tags",
    label: "标签",
    icon: "Tag",
    hint: "彩色标签组，如情景标签（校园、职场、新闻）",
    repeatable: true,
    splittable: true,
    itemLabel: "个标签",
    placeholder: "输入标签后回车…",
    defaults: { color: "blue" },
    optionFields: [{ key: "color", label: "标签颜色", kind: "select", options: ACCENT_OPTIONS }],
    normalize: (raw) => strList(raw),
    empty: () => [] as string[],
  },
  pronunciation: {
    type: "pronunciation",
    label: "音标",
    icon: "Volume2",
    hint: "英式 / 美式音标与音频链接",
    repeatable: false,
    splittable: false,
    defaults: { showUk: true, showUs: true, showAudio: false },
    optionFields: [
      { key: "showUk", label: "显示英式音标", kind: "switch" },
      { key: "showUs", label: "显示美式音标", kind: "switch" },
      { key: "showAudio", label: "显示音频链接", kind: "switch" },
    ],
    normalize: (raw) => normalizePronunciation(raw),
    empty: () => ({} as PronunciationValue),
  },
  senses: {
    type: "senses",
    label: "词性与释义",
    icon: "Layers",
    hint: "核心字段：词性 → 释义 → 用法/句型/例句/近反义词",
    repeatable: true,
    splittable: true,
    itemLabel: "个义项",
    placeholder: "添加义项…",
    defaults: {
      groupByPos: true,
      posStyle: "badge",
      showDefinition: true,
      showTranslation: true,
      showExamples: true,
      showUsage: true,
      showPatterns: true,
      showSynonyms: true,
      showAntonyms: false,
      showCollocations: true,
      showNotes: true,
    },
    optionFields: [
      { key: "groupByPos", label: "按词性分组", kind: "switch" },
      {
        key: "posStyle",
        label: "词性样式",
        kind: "select",
        options: [
          { value: "badge", label: "徽标" },
          { value: "plain", label: "纯文本" },
          { value: "inline", label: "行内" },
        ],
      },
      { key: "showTranslation", label: "显示中文释义", kind: "switch" },
      { key: "showDefinition", label: "显示英文释义", kind: "switch" },
      { key: "showExamples", label: "显示例句", kind: "switch" },
      { key: "showUsage", label: "显示用法说明", kind: "switch" },
      { key: "showPatterns", label: "显示句型结构", kind: "switch" },
      { key: "showCollocations", label: "显示搭配", kind: "switch" },
      { key: "showSynonyms", label: "显示近义词", kind: "switch" },
      { key: "showAntonyms", label: "显示反义词", kind: "switch" },
      { key: "showNotes", label: "显示备注", kind: "switch" },
    ],
    normalize: (raw) => normalizeSenses(raw),
    empty: () => [] as SenseItem[],
  },
  examples: {
    type: "examples",
    label: "例句",
    icon: "Quote",
    hint: "带翻译与出处的例句组（真题例句、原声例句）",
    repeatable: true,
    splittable: true,
    itemLabel: "条例句",
    placeholder: "添加例句…",
    defaults: { showZh: true, numbering: false },
    optionFields: [
      { key: "showZh", label: "显示翻译", kind: "switch" },
      { key: "numbering", label: "编号显示", kind: "switch" },
    ],
    normalize: (raw) => normalizeExamples(raw),
    empty: () => [] as ExampleItem[],
  },
  keyvalue: {
    type: "keyvalue",
    label: "词族 / 键值对",
    icon: "GitBranch",
    hint: "成对内容，如词族（abandonment → 抛弃）",
    repeatable: true,
    splittable: true,
    itemLabel: "对",
    placeholder: "添加一组…",
    defaults: { keyLabel: "词", valueLabel: "释义", inline: false },
    optionFields: [
      { key: "keyLabel", label: "键名", kind: "text" },
      { key: "valueLabel", label: "值名", kind: "text" },
      { key: "inline", label: "紧凑行内显示", kind: "switch" },
    ],
    normalize: (raw) => normalizeKeyValue(raw),
    empty: () => [] as KeyValueItem[],
  },
  transforms: {
    type: "transforms",
    label: "词性变换",
    icon: "Repeat",
    hint: "词形变化：过去式、过去分词、比较级、派生形式",
    repeatable: true,
    splittable: true,
    itemLabel: "项",
    placeholder: "添加变化形式…",
    defaults: { showPos: true, showNote: true },
    optionFields: [
      { key: "showPos", label: "显示词性", kind: "switch" },
      { key: "showNote", label: "显示说明", kind: "switch" },
    ],
    normalize: (raw) => normalizeTransforms(raw),
    empty: () => [] as TransformItem[],
  },
  table: {
    type: "table",
    label: "表格",
    icon: "Table2",
    hint: "自定义表格，如近义词辨析矩阵",
    repeatable: false,
    splittable: true,
    defaults: { zebra: true, headerRow: true },
    optionFields: [
      { key: "headerRow", label: "首行为表头", kind: "switch" },
      { key: "zebra", label: "斑马纹", kind: "switch" },
    ],
    normalize: (raw) => normalizeTable(raw),
    empty: () => ({ columns: ["列 1", "列 2"], rows: [] }) as TableValue,
  },
  image: {
    type: "image",
    label: "图片",
    icon: "Image",
    hint: "图片链接（本地文件路径或 URL），双编码记忆",
    repeatable: true,
    splittable: true,
    defaults: { imageHeight: 40, showCaption: true },
    optionFields: [
      { key: "imageHeight", label: "图片高度 (mm)", kind: "number", min: 10, max: 120 },
      { key: "showCaption", label: "显示图注", kind: "switch" },
    ],
    normalize: (raw) => normalizeImages(raw),
    empty: () => [] as ImageValue[],
  },
  quote: {
    type: "quote",
    label: "提示块",
    icon: "Info",
    hint: "强调块：用法提醒、易错点、辨析提示",
    repeatable: false,
    splittable: false,
    placeholder: "输入提示内容…",
    defaults: { tone: "tip" },
    optionFields: [
      {
        key: "tone",
        label: "色调",
        kind: "select",
        options: [
          { value: "info", label: "信息（蓝）" },
          { value: "tip", label: "提示（绿）" },
          { value: "warning", label: "警示（琥珀）" },
        ],
      },
    ],
    normalize: (raw) => valueToText(raw),
    empty: () => "",
  },
  rating: {
    type: "rating",
    label: "评分",
    icon: "Star",
    hint: "星级评分：重要度、掌握度、考频",
    repeatable: false,
    splittable: false,
    defaults: { max: 5, style: "stars", label: "重要度" },
    optionFields: [
      { key: "label", label: "名称", kind: "text" },
      { key: "max", label: "满分", kind: "number", min: 1, max: 10 },
      {
        key: "style",
        label: "样式",
        kind: "select",
        options: [
          { value: "stars", label: "星星" },
          { value: "dots", label: "圆点" },
        ],
      },
    ],
    normalize: (raw) => normalizeRating(raw),
    empty: () => ({ value: 0, max: 5 }) as RatingValue,
  },
  divider: {
    type: "divider",
    label: "分隔线",
    icon: "Minus",
    hint: "版面分隔装饰线",
    repeatable: false,
    splittable: false,
    defaults: { dividerStyle: "solid" },
    optionFields: [
      {
        key: "dividerStyle",
        label: "线型",
        kind: "select",
        options: [
          { value: "solid", label: "实线" },
          { value: "dashed", label: "虚线" },
          { value: "dotted", label: "点线" },
        ],
      },
    ],
    normalize: () => null,
    empty: () => null,
  },
};

export const SECTION_TYPE_LIST: SectionType[] = [
  "pronunciation",
  "senses",
  "examples",
  "keyvalue",
  "transforms",
  "list",
  "tags",
  "table",
  "text",
  "markdown",
  "quote",
  "rating",
  "image",
  "divider",
];

export const SECTION_ICON_CHOICES = [
  "Type", "AlignLeft", "List", "Tag", "Volume2", "Layers", "Quote", "GitBranch",
  "Repeat", "Table2", "Image", "Info", "Star", "Minus", "Sparkles", "BookOpen",
  "PenLine", "Lightbulb", "Hash", "Sigma", "Shuffle", "Languages", "Flame", "Puzzle",
];

/* ============================================================
   Schema 工厂与操作
   ============================================================ */

export function normalizeValue(type: SectionType, raw: unknown): unknown {
  return SECTIONS[type].normalize(raw);
}

export function emptyValueFor(type: SectionType): unknown {
  return SECTIONS[type].empty();
}

export interface MakeSectionInput {
  type: SectionType;
  label?: string;
  key?: string;
  icon?: string;
  color?: AccentId;
  order?: number;
  visible?: boolean;
  description?: string;
  options?: SectionOptions;
}

export function makeSection(input: MakeSectionInput): SectionDef {
  const def = SECTIONS[input.type];
  return {
    id: uid(),
    key: uniqueKey(input.key || input.type, []),
    label: input.label || def.label,
    type: input.type,
    icon: input.icon ?? def.icon,
    color: input.color,
    order: input.order ?? 0,
    visible: input.visible ?? true,
    builtin: false,
    description: input.description ?? def.hint,
    options: { ...def.defaults, ...(input.options ?? {}) },
  };
}

export function sortSections(sections: SectionDef[]): SectionDef[] {
  return [...sections].sort((a, b) => a.order - b.order);
}

export function findSection(schema: { sections: SectionDef[] }, key: string): SectionDef | undefined {
  return schema.sections.find((s) => s.key === key);
}

/** 数据条目中已填写内容的字段数 */
export function filledSectionCount(values: Record<string, unknown>, sections: SectionDef[]): number {
  return sections.filter((s) => !isValueEmpty(s.type, values[s.key])).length;
}

export function isValueEmpty(type: SectionType, value: unknown): boolean {
  if (value == null) return true;
  switch (type) {
    case "text":
    case "markdown":
    case "quote":
      return !valueToText(value);
    case "list":
    case "tags":
      return !Array.isArray(value) || value.length === 0;
    case "senses":
    case "examples":
    case "keyvalue":
    case "transforms":
    case "image":
      return !Array.isArray(value) || value.length === 0;
    case "pronunciation": {
      const p = value as PronunciationValue;
      return !p.uk && !p.us && !p.audioUk && !p.audioUs;
    }
    case "table": {
      const t = value as TableValue;
      return !t || !t.rows || t.rows.length === 0;
    }
    case "rating": {
      const r = value as RatingValue;
      return !r || !r.value;
    }
    case "divider":
      return false;
    default:
      return false;
  }
}

/** 数组型字段的条目数（用于分页拆分） */
export function valueLength(type: SectionType, value: unknown): number {
  switch (type) {
    case "senses":
    case "examples":
    case "keyvalue":
    case "transforms":
    case "image":
    case "list":
    case "tags":
      return Array.isArray(value) ? value.length : 0;
    case "table":
      return isPlainObject(value) && Array.isArray(value.rows) ? value.rows.length : 0;
    default:
      return 1;
  }
}

/** 取数组型字段的切片（分页时使用），非数组类型原样返回。
 *  注意：不重新归一化，输入应已是规范形态（store/导入保证）。 */
export function sliceValue(type: SectionType, value: unknown, from: number, to: number): unknown {
  switch (type) {
    case "senses":
    case "examples":
    case "keyvalue":
    case "transforms":
    case "image":
    case "list":
    case "tags":
      return Array.isArray(value) ? (value as unknown[]).slice(from, to) : value;
    case "table": {
      const t = value as TableValue;
      if (!t || !Array.isArray(t.rows)) return value;
      return { columns: t.columns, rows: t.rows.slice(from, to) };
    }
    default:
      return value;
  }
}

/** 危险字段键过滤（来自不可信 JSON 的键）：__proto__/constructor/prototype 一律丢弃，消除原型污染面 */
export function isSafeFieldKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

export function normalizeEntryValues(
  values: Record<string, unknown>,
  sections: SectionDef[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!isSafeFieldKey(k)) continue;
    const sec = sections.find((s) => s.key === k);
    if (sec) {
      const nv = normalizeValue(sec.type, v);
      if (!isValueEmpty(sec.type, nv)) out[k] = nv;
    } else if (v != null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

/** 未在 Schema 中定义但有数据的键 */
export function extraKeys(values: Record<string, unknown>, sections: SectionDef[]): string[] {
  const keys = new Set(sections.map((s) => s.key));
  return Object.keys(values).filter((k) => !keys.has(k) && !isValueEmptyForUnknown(values[k]));
}

function isValueEmptyForUnknown(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
}

export function suggestKeyFromLabel(label: string, existing: Iterable<string>): string {
  const base = /\p{Script=Han}/u.test(label)
    ? `sec_${Date.now().toString(36).slice(-5)}`
    : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "section";
  return uniqueKey(base, existing);
}

export { uniqueKey };

/* ============================================================
   义项细粒度分页：核心释义 / 例句扩展 两段切片
   ============================================================ */

export interface SenseCell {
  from: number;
  to: number;
  part: "full" | "core" | "extras";
  /** 原始义项序号（0 基）——供跨页连续编号 */
  no?: number;
}

/** 该义项是否存在「扩展内容」（例句/搭配/近反义词/备注），且未被选项隐藏 */
export function senseHasExtras(sense: SenseItem, options: SectionOptions): boolean {
  return (
    (options.showExamples !== false && sense.examples.length > 0) ||
    (options.showCollocations !== false && sense.collocations.length > 0) ||
    (options.showSynonyms !== false && sense.synonyms.length > 0) ||
    (options.showAntonyms === true && sense.antonyms.length > 0) ||
    (options.showNotes !== false && Boolean(sense.notes))
  );
}

/** 把义项数组切成单元（每个单元一个 cell）：核心段 + 可选扩展段 */
export function buildSenseUnits(senses: SenseItem[], options: SectionOptions): { from: number; to: number; cells: SenseCell[] }[] {
  const units: { from: number; to: number; cells: SenseCell[] }[] = [];
  senses.forEach((s, i) => {
    units.push({ from: i, to: i + 1, cells: [{ from: i, to: i + 1, part: "core", no: i }] });
    if (senseHasExtras(s, options)) {
      units.push({ from: i, to: i + 1, cells: [{ from: i, to: i + 1, part: "extras", no: i }] });
    }
  });
  return units;
}

/** 按 cell 列表生成义项切片克隆（不修改原数据） */
export function sliceSenseCells(value: unknown, cells: SenseCell[]): SenseItem[] {
  const senses = Array.isArray(value) ? (value as SenseItem[]) : [];
  const out: SenseItem[] = [];
  for (const c of cells) {
    for (let i = c.from; i < Math.min(c.to, senses.length); i += 1) {
      const s = senses[i];
      if (!s) continue;
      if (c.part === "full") {
        out.push(s);
      } else if (c.part === "core") {
        out.push({ ...s, printNo: c.no ?? i, examples: [], collocations: [], synonyms: [], antonyms: [], notes: "" });
      } else {
        out.push({ ...s, cont: true, translation: "", definition: "", usage: "", patterns: [] });
      }
    }
  }
  return out;
}
