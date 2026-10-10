import type { Entry, Schema, SectionDef, SectionType } from "./types";
import { makeSection, normalizeValue, isValueEmpty } from "./sections";
import { canonicalKey, strList } from "./sections";
import { isPlainObject } from "./utils";

/**
 * 从词条数据推断字段 Schema。
 * 用于：导入未附带 Schema 的 JSON（例如 AI 整理出的纯词条文件）时自动排版。
 */

const KEY_HINTS: { re: RegExp; type: SectionType }[] = [
  { re: /^(phonetic|phonetics|pronunciation|ipa|音标|发音)/i, type: "pronunciation" },
  { re: /^(senses?|definitions?|meanings?|释义|义项|词性与释义)/i, type: "senses" },
  { re: /^(examples?|example_?sentences?|sentences?|例句)/i, type: "examples" },
  { re: /^(family|word_?family|derivatives?|词族|派生)/i, type: "keyvalue" },
  { re: /^(transforms?|inflections?|forms|wordforms|词性变换|变形|词形变化)/i, type: "transforms" },
  { re: /^(tags?|contexts?|情景|标签)/i, type: "tags" },
  { re: /^(collocations?|collos?|chunks|搭配|词组)/i, type: "list" },
  { re: /^(associations?|mnemonics?|联想|助记|记忆)/i, type: "list" },
  { re: /^(synonyms?|antonyms?|near_?synonyms?|近义词|反义词)/i, type: "list" },
  { re: /^(notes?|note|notes_?md|学习笔记|笔记|备注)/i, type: "markdown" },
  { re: /^(etymology|origin|词源)/i, type: "text" },
  { re: /^(usage|用法|辨析|说明)/i, type: "markdown" },
  { re: /^(table|matrix|辨析表|表格)/i, type: "table" },
  { re: /^(images?|media|pictures?|图片)/i, type: "image" },
  { re: /^(rating|importance|freq|level|评分|重要度)/i, type: "rating" },
  { re: /^(quote|tip|hint|提示|提醒)/i, type: "quote" },
];

const KEY_LABELS: Record<string, string> = {
  phonetic: "音标",
  phonetics: "音标",
  pronunciation: "音标",
  ipa: "音标",
  senses: "词性与释义",
  meanings: "释义",
  definitions: "释义",
  sense: "释义",
  definition: "英文释义",
  translation: "中文释义",
  family: "词族",
  wordfamily: "词族",
  derivatives: "派生词",
  transforms: "词性变换",
  forms: "词形变化",
  inflections: "词形变化",
  collocations: "常用搭配",
  collocation: "常用搭配",
  associations: "联想与助记",
  mnemonics: "联想与助记",
  memory: "记忆方法",
  synonyms: "近义词",
  antonyms: "反义词",
  nearsynonyms: "近义词",
  contexts: "情景标签",
  context: "情景标签",
  tags: "标签",
  examples: "例句",
  examplesextra: "情景例句",
  notes: "学习笔记",
  note: "笔记",
  etymology: "词源",
  origin: "词源",
  usage: "用法说明",
  usagenotes: "用法说明",
  discrimination: "近义辨析",
  pitfall: "易错提醒",
  rating: "重要度",
  importance: "重要度",
  freq: "词频",
  level: "难度",
  image: "图片",
  images: "图片",
  media: "图片",
  quote: "提示",
  tip: "提示",
  source: "来源",
  pos: "词性",
  posratio: "词性比例",
};

export function labelForKey(key: string): string {
  const c = canonicalKey(key);
  if (KEY_LABELS[c]) return KEY_LABELS[c];
  if (/[\u4e00-\u9fff]/.test(key)) return key;
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function inferTypeFromValue(key: string, value: unknown): SectionType {
  const c = canonicalKey(key);
  for (const hint of KEY_HINTS) {
    if (hint.re.test(c)) return hint.type;
  }
  if (typeof value === "number") return "rating";
  if (typeof value === "string") {
    return /\n/.test(value) || value.length > 140 ? "markdown" : "text";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "list";
    const items = value.filter((v) => v != null);
    if (items.length && items.every((v) => typeof v === "string" || typeof v === "number")) {
      return "list";
    }
    if (items.every((v) => isPlainObject(v))) {
      const objs = items as Record<string, unknown>[];
      const has = (...keys: string[]) =>
        objs.every((o) => keys.some((k) => Object.keys(o).some((ok) => canonicalKey(ok) === canonicalKey(k))));
      if (has("pos", "partOfSpeech") && has("translation", "definition", "meaning", "zh")) return "senses";
      if (has("en", "example", "sentence", "text") && has("zh", "translation", "cn", "meaning")) return "examples";
      if (has("form") || (has("word", "pos") && !has("value", "meaning", "translation"))) return "transforms";
      if (has("key", "word", "term")) return "keyvalue";
      if (has("url", "src", "image")) return "image";
    }
    return "keyvalue";
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).map(canonicalKey);
    if (keys.some((k) => ["uk", "us", "bre", "ame", "british", "american", "英", "美"].includes(k))) {
      return "pronunciation";
    }
    if (keys.some((k) => k === "rows" || k === "columns")) return "table";
    if (keys.some((k) => k === "url" || k === "src")) return "image";
    if (keys.some((k) => ["value", "rating", "score"].includes(k))) return "rating";
    return "keyvalue";
  }
  return "text";
}

/** 供「提升为字段」使用：根据键名与样例值猜测字段类型 */
export function guessSectionType(key: string, sample: unknown = ""): SectionType {
  return inferTypeFromValue(key, sample);
}

const PRIORITY: Record<string, number> = {
  phonetic: 0,
  phonetic_uk: 1,
  senses: 1,
  meanings: 1,
  definitions: 1,
};

export function inferSchema(entries: Entry[]): Schema {
  const keyOrder: string[] = [];
  const samples = new Map<string, unknown>();
  for (const entry of entries) {
    for (const [k, v] of Object.entries(entry.values)) {
      if (v == null || v === "") continue;
      if (!samples.has(k)) {
        keyOrder.push(k);
      }
      const prev = samples.get(k);
      if (prev == null || isValueEmpty(inferTypeFromValue(k, prev), prev)) {
        samples.set(k, v);
      }
    }
  }
  const sections: SectionDef[] = [];
  keyOrder.forEach((key) => {
    const value = samples.get(key);
    const type = inferTypeFromValue(key, value);
    const section = makeSection({
      type,
      key,
      label: labelForKey(key),
      order: 0,
      description: "由导入数据自动识别",
    });
    section.builtin = false;
    sections.push(section);
  });
  sections.sort((a, b) => {
    const pa = PRIORITY[canonicalKey(a.key)] ?? 10;
    const pb = PRIORITY[canonicalKey(b.key)] ?? 10;
    if (pa !== pb) return pa - pb;
    return 0;
  });
  sections.forEach((s, i) => {
    s.order = i;
  });
  return { version: 1, presetId: "inferred", sections };
}

/**
 * 将任意对象值的字段归一化到给定 Schema 的键。
 * 匹配优先级：精确 key → 规范化 key → 标签文本。
 */
export function mapRowToSchema(
  row: Record<string, unknown>,
  schema: Schema,
): { values: Record<string, unknown>; consumed: Set<string> } {
  const values: Record<string, unknown> = {};
  const consumed = new Set<string>();
  for (const section of schema.sections) {
    const candidates = [section.key, section.label];
    let found: unknown;
    let foundKey: string | undefined;
    for (const [k, v] of Object.entries(row)) {
      if (v == null || v === "") continue;
      const ck = canonicalKey(k);
      if (candidates.some((c) => canonicalKey(c) === ck)) {
        found = v;
        foundKey = k;
        break;
      }
    }
    if (found === undefined && section.type === "senses") {
      const t = row["translation"] ?? row["释义"] ?? row["中文释义"];
      if (t != null) {
        found = t;
        foundKey = "translation";
      }
    }
    if (found !== undefined) {
      const nv = normalizeValue(section.type, found);
      if (!isValueEmpty(section.type, nv)) values[section.key] = nv;
      if (foundKey) consumed.add(foundKey);
    }
  }
  return { values, consumed };
}

/** 未知键保留为原值（供「提升为字段」使用） */
export function keepExtras(
  row: Record<string, unknown>,
  consumed: Set<string>,
  reserved: Set<string>,
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (consumed.has(k)) continue;
    if (reserved.has(canonicalKey(k))) continue;
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    extras[k] = typeof v === "string" ? v : v;
  }
  return extras;
}

export function rowTags(row: Record<string, unknown>): string[] {
  const raw = row["tags"] ?? row["tag"] ?? row["标签"];
  return raw == null ? [] : strList(raw);
}
