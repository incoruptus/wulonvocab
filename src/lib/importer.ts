import Papa from "papaparse";
import type { Entry, Schema, SenseItem, Wordbook, WordbookMetaInfo } from "./types";
import type { StudySrs } from "./study/types";
import { makeEntry } from "./presets";
import { inferSchema, keepExtras, labelForKey, mapRowToSchema, rowTags } from "./infer";
import {
  canonicalKey,
  isSafeFieldKey,
  isValueEmpty,
  normalizeEntryValues,
  normalizePronunciation,
  normalizeSenses,
  normalizeTransforms,
  parsePosPrefix,
  sanitizeText,
  strList,
  normalizeValue,
  SECTIONS,
  uniqueKey,
} from "./sections";
import { ACCENTS } from "./paper";
import { isPlainObject, uid } from "./utils";

/* ============================================================
   导入解析：把任意来源的 JSON / CSV 文本变成统一的「行对象」
   ============================================================ */

export interface ParsedImport {
  kind: "wulonvocab" | "rows" | "map" | "ecdict" | "unknown";
  headers: string[];
  rows: Record<string, unknown>[];
  wordbookMeta?: { name?: string; description?: string; tags?: string[]; meta?: WordbookMetaInfo };
  schema?: Schema;
  warnings: string[];
  entryLike?: boolean;
}

const ENTRY_WRAPPER_KEYS = ["entries", "words", "wordlist", "list", "data", "items", "词条", "单词列表"];
const HEADWORD_KEYS = ["headword", "word", "term", "spelling", "expression", "单词", "词", "词汇"];
const META_KEYS = new Set(
  ["id", "headword", "word", "term", "spelling", "expression", "单词", "词", "tags", "tag", "status", "starred", "values", "createdat", "updatedat", "source"].map(canonicalKey),
);

const ECDICT_MARKERS = ["translation", "exchange", "bnc", "frq", "collins", "oxford", "phonetic", "释义", "音标"];

function rowHeadword(row: Record<string, unknown>): string {
  for (const k of HEADWORD_KEYS) {
    const v = row[k] ?? Object.entries(row).find(([rk]) => canonicalKey(rk) === canonicalKey(k))?.[1];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return sanitizeText(v);
    if (isPlainObject(v)) {
      const inner = v["text"] ?? v["value"] ?? v["word"];
      if (typeof inner === "string" && inner.trim()) return sanitizeText(inner);
    }
  }
  return "";
}

export function isEcDictRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).map(canonicalKey);
  const hits = ECDICT_MARKERS.filter((m) => keys.includes(canonicalKey(m))).length;
  const posRatio = typeof row.pos === "string" && /^[a-z]+:\d+/.test(row.pos);
  return hits >= 2 || posRatio;
}

/* ---------------- JSON ---------------- */

export function parseImportJson(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON 解析失败：${(e as Error).message}`);
  }
  return classifyJson(data);
}

export function classifyJson(data: unknown): ParsedImport {
  const warnings: string[] = [];
  if (Array.isArray(data)) {
    if (!data.length) return { kind: "unknown", headers: [], rows: [], warnings: ["文件为空"] };
    if (data.every((d) => typeof d === "string")) {
      return { kind: "rows", headers: ["headword"], rows: data.map((d) => ({ headword: String(d) })), warnings };
    }
    const rows = data.filter(isPlainObject) as Record<string, unknown>[];
    const kind = rows.length && rows.every(isEcDictRow) ? "ecdict" : "rows";
    return { kind, headers: collectHeaders(rows), rows, warnings };
  }
  if (!isPlainObject(data)) {
    return { kind: "unknown", headers: [], rows: [], warnings: ["无法识别的 JSON 结构"] };
  }
  const obj = data as Record<string, unknown>;
  const isDoc =
    obj.format === "wulonvocab" ||
    (isPlainObject(obj.wordbook) && Array.isArray(obj.entries)) ||
    (isPlainObject(obj.schema) && Array.isArray((obj.schema as Record<string, unknown>).sections) && Array.isArray(obj.entries));

  if (isDoc) {
    const entries = (obj.entries as unknown[]).filter(isPlainObject) as Record<string, unknown>[];
    const schema = normalizeSchemaInput(obj.schema, warnings);
    const wb = isPlainObject(obj.wordbook) ? (obj.wordbook as Record<string, unknown>) : {};
    return {
      kind: "wulonvocab",
      headers: collectHeaders(entries),
      rows: entries,
      schema,
      entryLike: true,
      wordbookMeta: {
        name: typeof wb.name === "string" ? wb.name : undefined,
        description: typeof wb.description === "string" ? wb.description : undefined,
        tags: Array.isArray(wb.tags) ? wb.tags.map(String) : undefined,
        meta: isPlainObject(wb.meta) ? (wb.meta as WordbookMetaInfo) : undefined,
      },
      warnings,
    };
  }

  // 包装键：{ entries: [...] } / { words: [...] }
  for (const wk of ENTRY_WRAPPER_KEYS) {
    const found = obj[wk] ?? obj[Object.keys(obj).find((k) => canonicalKey(k) === canonicalKey(wk)) ?? ""];
    if (Array.isArray(found)) {
      const rows = found.filter(isPlainObject) as Record<string, unknown>[];
      return {
        kind: rows.length && rows.every(isEcDictRow) ? "ecdict" : "rows",
        headers: collectHeaders(rows),
        rows,
        wordbookMeta: {
          name: typeof obj.name === "string" ? obj.name : typeof obj.title === "string" ? obj.title : undefined,
          description: typeof obj.description === "string" ? obj.description : undefined,
          tags: Array.isArray(obj.tags) ? obj.tags.map(String) : undefined,
        },
        schema: normalizeSchemaInput(obj.schema, warnings),
        warnings,
      };
    }
  }

  // 单条词条
  if (rowHeadword(obj)) {
    return { kind: "rows", headers: Object.keys(obj), rows: [obj], warnings };
  }

  // 以单词为键的字典对象：{ abandon: {...} / "释义" }
  const entries = Object.entries(obj).filter(([, v]) => v != null);
  if (entries.length && entries.every(([, v]) => typeof v !== "function")) {
    const rows = entries.map(([word, v]) => {
      if (isPlainObject(v)) return { headword: word, ...(v as Record<string, unknown>) };
      return { headword: word, translation: v };
    });
    const kind = rows.length > 8 && rows.every(isEcDictRow) ? "ecdict" : "map";
    if (kind === "map") warnings.push("「单词 → 内容」式的字典已自动展开成词条");
    return { kind, headers: collectHeaders(rows), rows, warnings };
  }

  return { kind: "unknown", headers: [], rows: [], warnings: ["无法识别的 JSON 结构"] };
}

function normalizeSchemaInput(input: unknown, warnings: string[] = []): Schema | undefined {
  if (!isPlainObject(input)) return undefined;
  const sections = (input as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return undefined;
  const out: Schema["sections"] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  sections.forEach((s, i) => {
    if (!isPlainObject(s)) {
      warnings.push("忽略了一个结构异常的字段定义");
      return;
    }
    const type = (typeof s.type === "string" ? s.type : "text") as Schema["sections"][number]["type"];
    if (!SECTIONS[type]) {
      warnings.push(`忽略了未知字段类型「${String(s.type ?? "")}」`);
      return;
    }
    const def = SECTIONS[type];
    const id = typeof s.id === "string" && s.id && !seenIds.has(s.id) ? s.id : uid();
    seenIds.add(id);
    let key = typeof s.key === "string" && s.key ? s.key : `sec_${i}`;
    if (seenKeys.has(key)) {
      const nk = uniqueKey(key, [...seenKeys]);
      warnings.push(`重复的字段键「${key}」已改为「${nk}」`);
      key = nk;
    }
    seenKeys.add(key);
    // 选项按注册表加固：数字 clamp、枚举白名单（防 rating.max=百万 渲染爆炸、非法色值）
    const defaults = def.defaults as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...defaults, ...(isPlainObject(s.options) ? (s.options as Record<string, unknown>) : {}) };
    for (const f of def.optionFields) {
      const v = merged[f.key];
      if (v === undefined) continue;
      if (f.kind === "number") {
        const n = Number(v);
        const min = f.min ?? 0;
        const max = f.max ?? Number.MAX_SAFE_INTEGER;
        merged[f.key] = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defaults[f.key];
        if (Number.isFinite(n) && n > max) warnings.push(`字段「${key}」的数值超出范围，已收敛到 ${max}`);
      } else if (f.kind === "select" && f.options) {
        if (!f.options.some((o) => o.value === v)) {
          merged[f.key] = defaults[f.key];
          warnings.push(`字段「${key}」的选项值非法，已恢复默认`);
        }
      }
    }
    out.push({
      id,
      key,
      label: typeof s.label === "string" && s.label ? s.label : labelForKey(String(s.key ?? type)),
      type,
      icon: typeof s.icon === "string" ? s.icon : def.icon,
      color:
        typeof s.color === "string" && (Object.keys(ACCENTS) as string[]).includes(s.color)
          ? (s.color as never)
          : undefined,
      order: typeof s.order === "number" ? s.order : i,
      visible: s.visible !== false,
      builtin: Boolean(s.builtin),
      description: typeof s.description === "string" ? s.description : undefined,
      options: merged,
    });
  });
  return { version: 1, presetId: typeof input.presetId === "string" ? input.presetId : "imported", sections: out };
}

function collectHeaders(rows: Record<string, unknown>[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i += 1) {
    for (const k of Object.keys(rows[i])) {
      const c = canonicalKey(k);
      if (!seen.has(c)) {
        seen.add(c);
        headers.push(k);
      }
    }
  }
  return headers;
}

/* ---------------- CSV / TSV ---------------- */

const ECDICT_COLUMNS = ["word", "phonetic", "definition", "translation", "pos", "collins", "oxford", "tag", "bnc", "frq", "exchange", "detail", "audio"];

export function parseImportCsv(text: string, filename = ""): ParsedImport {
  const delimiter = filename.toLowerCase().endsWith(".tsv") || (text.split("\t").length > text.split(",").length && text.includes("\t")) ? "\t" : ",";
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy" });
  const data = (result.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim()));
  const warnings: string[] = [];
  if (!data.length) return { kind: "unknown", headers: [], rows: [], warnings: ["CSV 内容为空"] };

  const first = data[0].map((c) => canonicalKey(String(c ?? "")));
  const knownHeaderHits = first.filter((c) =>
    ["word", "headword", "单词", "phonetic", "音标", "translation", "释义", "definition", "词性", "pos", "例句", "example"].map(canonicalKey).includes(c),
  ).length;

  if (knownHeaderHits >= 2) {
    const headers = data[0].map((c) => sanitizeText(String(c ?? "")));
    const rows = data.slice(1).map((cells) => {
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const v = sanitizeText(String(cells[i] ?? ""));
        if (v) row[h] = v;
      });
      return row;
    });
    const isEcdict = headers.some((h) => ["exchange", "bnc", "frq"].includes(canonicalKey(h)));
    return { kind: isEcdict ? "ecdict" : "rows", headers, rows: rows.filter((r) => Object.keys(r).length), warnings };
  }

  // 无表头：按 ECDICT 常用列顺序推断
  const width = Math.max(...data.map((r) => r.length));
  const columns = width >= 8 ? ECDICT_COLUMNS.slice(0, width) : ["word", "translation", "definition", "phonetic"];
  warnings.push("未检测到表头，已按 ECDICT 列顺序解析（可在预览中核对）");
  const rows = data.map((cells) => {
    const row: Record<string, unknown> = {};
    columns.forEach((c, i) => {
      const v = sanitizeText(String(cells[i] ?? ""));
      if (v) row[c] = v;
    });
    return row;
  });
  return { kind: "ecdict", headers: columns, rows: rows.filter((r) => Object.keys(r).length), warnings };
}

export function parseImportText(text: string, filename = ""): ParsedImport {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("文件内容为空");
  if (filename.toLowerCase().endsWith(".csv") || filename.toLowerCase().endsWith(".tsv")) {
    return parseImportCsv(text, filename);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseImportJson(trimmed);
    } catch (e) {
      if (filename.toLowerCase().endsWith(".json")) throw e;
    }
  }
  // NDJSON
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 1 && lines.every((l) => l.trim().startsWith("{"))) {
    const rows = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    return { kind: rows.every(isEcDictRow) ? "ecdict" : "rows", headers: collectHeaders(rows), rows, warnings: ["按 NDJSON（每行一个 JSON）解析"] };
  }
  return parseImportCsv(text, filename);
}

/* ---------------- ECDICT 专有映射 ---------------- */

const EXCHANGE_LABELS: Record<string, string> = {
  p: "过去式", d: "过去分词", i: "现在分词", "3": "第三人称单数",
  r: "比较级", t: "最高级", s: "复数", "0": "原型", "1": "原型变换",
};

const EXAM_TAG_LABELS: Record<string, string> = {
  zk: "中考", gk: "高考", cet4: "四级", cet6: "六级", ky: "考研",
  toefl: "托福", ielts: "雅思", gre: "GRE",
};

export function ecDictRowToValues(row: Record<string, unknown>): { values: Record<string, unknown>; tags: string[] } {
  const values: Record<string, unknown> = {};
  const get = (k: string) => {
    const v = row[k] ?? Object.entries(row).find(([rk]) => canonicalKey(rk) === canonicalKey(k))?.[1];
    return v == null ? "" : sanitizeText(String(v));
  };

  const phonetic = get("phonetic");
  if (phonetic) values.phonetic = normalizePronunciation(phonetic);

  const transLines = get("translation").split(/\\n|\r?\n/).map(sanitizeText).filter(Boolean);
  const defLines = get("definition").split(/\\n|\r?\n/).map(sanitizeText).filter(Boolean);
  const senses: SenseItem[] = [];
  const maxLen = Math.max(transLines.length, defLines.length);
  let lastPos = "";
  for (let i = 0; i < maxLen; i += 1) {
    const transRaw = transLines[i] ?? "";
    const { pos, rest } = transRaw ? parsePosPrefix(transRaw) : { pos: undefined, rest: "" };
    const p = pos ?? (transRaw ? lastPos : lastPos);
    if (pos) lastPos = pos;
    const sense: SenseItem = {
      id: uid(),
      pos: p,
      translation: rest || (transRaw ? parsePosPrefix(transRaw).rest : ""),
      definition: defLines[i] ?? "",
      examples: [],
      usage: "",
      patterns: [],
      synonyms: [],
      antonyms: [],
      collocations: [],
      notes: "",
    };
    if (sense.translation || sense.definition) senses.push(sense);
  }
  if (senses.length) values.senses = normalizeSenses(senses);

  const exchange = get("exchange");
  if (exchange) {
    const items = exchange
      .split(/[/|、]/)
      .map((seg) => seg.trim())
      .filter(Boolean)
      .map((seg) => {
        const idx = seg.indexOf(":");
        if (idx <= 0) return null;
        const code = seg.slice(0, idx).trim();
        const form = seg.slice(idx + 1).trim();
        if (!form) return null;
        return { form, pos: "", note: EXCHANGE_LABELS[code] ?? code };
      })
      .filter(Boolean) as { form: string; pos: string; note: string }[];
    if (items.length) values.transforms = normalizeTransforms(items);
  }

  const tags: string[] = [];
  const tagStr = get("tag");
  const contexts: string[] = [];
  if (tagStr) {
    for (const t of tagStr.split(/\s+/).filter(Boolean)) {
      tags.push(t);
      contexts.push(EXAM_TAG_LABELS[t.toLowerCase()] ?? t);
    }
    values.contexts = strList(contexts);
  }
  const oxford = get("oxford");
  if (oxford === "1" || oxford.toLowerCase() === "true") {
    tags.push("oxford3000");
    const cur = (values.contexts as string[] | undefined) ?? [];
    cur.unshift("牛津核心");
    values.contexts = cur;
  }
  const collins = get("collins");
  if (collins && collins !== "0") {
    values.collins = /[★⭐]/.test(collins) ? { value: (collins.match(/[★⭐]/g) ?? []).length, max: 5, label: "柯林斯" } : { value: Number(collins.replace(/[^\d]/g, "")) || 0, max: 5, label: "柯林斯" };
  }
  const bnc = get("bnc");
  const frq = get("frq");
  if (bnc && bnc !== "0") values.bnc = Number(bnc) || bnc;
  if (frq && frq !== "0") values.frq = Number(frq) || frq;

  return { values, tags };
}

/* ---------------- 行 → 词条 ---------------- */

const ECDICT_CONSUMED = new Set(["word", "phonetic", "definition", "translation", "pos", "tag", "exchange", "collins", "oxford", "bnc", "frq"].map(canonicalKey));

export interface RowsToEntriesResult {
  entries: Entry[];
  warnings: string[];
}

/** 文档携带的学习进度：只接受形状完好的 srs，其余丢弃（防畸形数据进学习引擎） */
function sanitizeSrs(raw: unknown): StudySrs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  // 注意：StudySrs 为 camelCase（elapsedDays/scheduledDays），与 ts-fsrs Card 的蛇形名不同
  const required = ["due", "stability", "difficulty", "elapsedDays", "scheduledDays", "reps", "lapses", "state"] as const;
  for (const k of required) {
    if (typeof r[k] !== "number" || !Number.isFinite(r[k] as number)) return undefined;
  }
  return raw as StudySrs;
}

export function rowsToEntries(parsed: ParsedImport, schema?: Schema): RowsToEntriesResult {
  const warnings = [...parsed.warnings];
  const entries: Entry[] = [];
  let skipped = 0;

  for (const row of parsed.rows) {
    const headword = rowHeadword(row);
    if (!headword) {
      skipped += 1;
      continue;
    }
    const now = Date.now();
    const isEntryDoc = parsed.entryLike && isPlainObject(row.values);
    if (isEntryDoc) {
      const rawValues = row.values as Record<string, unknown>;
      const entry = makeEntry({
        headword,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        status: (typeof row.status === "string" ? row.status : "new") as Entry["status"],
        starred: Boolean(row.starred),
        values: schema ? mapValuesWithSchema(rawValues, schema) : { ...rawValues },
        source: { kind: "import", label: parsed.wordbookMeta?.name, at: now },
        srs: sanitizeSrs(row.srs),
      });
      entries.push(entry);
      continue;
    }
    if (parsed.kind === "ecdict" || isEcDictRow(row)) {
      const { values, tags } = ecDictRowToValues(row);
      const extras = keepExtras(row, new Set([...ECDICT_CONSUMED, ...[...META_KEYS].filter((k) => k === canonicalKey(headword))]), META_KEYS);
      const entry = makeEntry({
        headword,
        tags: [...new Set([...tags, ...rowTags(row)])],
        values: schema ? mapValuesWithSchema({ ...extras, ...values }, schema) : { ...extras, ...values },
        source: { kind: "import", label: "ECDICT 词库", at: now },
      });
      entries.push(entry);
      continue;
    }
    // 通用行
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!isSafeFieldKey(k)) continue; // 不可信 JSON 键护栏（__proto__ 等）
      if (META_KEYS.has(canonicalKey(k))) continue;
      if (k === "values" || v == null || v === "") continue;
      extras[k] = v;
    }
    const entry = makeEntry({
      headword,
      tags: rowTags(row),
      values: schema ? mapValuesWithSchema(extras, schema) : extras,
      source: { kind: "import", label: parsed.wordbookMeta?.name, at: now },
    });
    entries.push(entry);
  }

  if (skipped) warnings.push(`跳过 ${skipped} 条缺少单词字段的记录`);
  const merged = mergeDuplicateEntries(entries);
  return { entries: merged, warnings };
}

function mapValuesWithSchema(rawValues: Record<string, unknown>, schema: Schema): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    if (!isSafeFieldKey(k)) continue; // 不可信 JSON 键护栏
    row[k] = v;
  }
  const { values, consumed } = mapRowToSchema(row, schema);
  const extras = keepExtras(row, consumed, META_KEYS);
  const out: Record<string, unknown> = { ...extras, ...values };
  if (isPlainObject(rawValues)) {
    for (const [k, v] of Object.entries(rawValues)) {
      if (!isSafeFieldKey(k)) continue;
      if (Object.prototype.hasOwnProperty.call(out, k)) continue;
      out[k] = v;
    }
  }
  return out;
}

/**
 * 把 incoming 合并进 target（保留 target 的 id / headword / createdAt / srs）：
 * 标签并集、星标取或、数组字段去重拼接、对象浅并、字符串不同则以换行相连。
 * 纯函数（导出供「批量合并词条」与导入去重复用）。
 */
export function mergeEntryBodies(target: Entry, incoming: Entry, now = Date.now()): Entry {
  return {
    ...target,
    tags: [...new Set([...target.tags, ...incoming.tags])],
    starred: target.starred || incoming.starred,
    updatedAt: now,
    values: mergeValues(target.values, incoming.values),
  };
}

/** 合并同名单词（大小写不敏感）；数组字段去重拼接 */
export function mergeDuplicateEntries(entries: Entry[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const entry of entries) {
    const key = entry.headword.toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, entry);
      continue;
    }
    map.set(key, mergeEntryBodies(prev, entry));
  }
  return [...map.values()];
}

function mergeValues(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, bv] of Object.entries(b)) {
    const av = out[k];
    if (av == null || av === "") {
      out[k] = bv;
      continue;
    }
    if (Array.isArray(av) && Array.isArray(bv)) {
      const seen = new Set(av.map((x) => JSON.stringify(x)));
      const merged = [...av];
      for (const item of bv) {
        const sig = JSON.stringify(item);
        if (!seen.has(sig)) {
          seen.add(sig);
          merged.push(item);
        }
      }
      out[k] = merged;
      continue;
    }
    if (isPlainObject(av) && isPlainObject(bv)) {
      out[k] = { ...av, ...bv };
      continue;
    }
    if (typeof av === "string" && typeof bv === "string" && av !== bv) {
      out[k] = `${av}\n${bv}`;
      continue;
    }
  }
  return out;
}

/* ---------------- 组装词库 ---------------- */

export interface BuildBookOptions {
  name?: string;
  schema?: Schema;
  baseBook?: Wordbook;
  sourceLabel?: string;
}

export interface BuildBookResult {
  name: string;
  schema: Schema;
  entries: Entry[];
  warnings: string[];
  meta: WordbookMetaInfo | undefined;
  description?: string;
  tags: string[];
  schemaOrigin: "doc" | "current" | "inferred";
}

export function buildImportResult(parsed: ParsedImport, options: BuildBookOptions = {}): BuildBookResult {
  const baseSchema = options.schema ?? (options.baseBook ? options.baseBook.schema : undefined);
  let schemaOrigin: "doc" | "current" | "inferred";
  let schema: Schema;
  if (parsed.schema && parsed.schema.sections.length) {
    schema = parsed.schema;
    schemaOrigin = "doc";
  } else if (baseSchema && baseSchema.sections.length) {
    schema = baseSchema;
    schemaOrigin = "current";
  } else {
    schema = { version: 1, presetId: "inferred", sections: [] };
    schemaOrigin = "inferred";
  }

  const pass = rowsToEntries(parsed, schemaOrigin === "inferred" ? undefined : schema);
  let entries = pass.entries;
  if (schemaOrigin === "inferred") {
    schema = inferSchema(entries);
  }
  entries = entries.map((e) => ({ ...e, values: normalizeEntryValues(e.values, schema.sections) }));

  const warnings = [...pass.warnings];
  return {
    name: options.name || parsed.wordbookMeta?.name || options.baseBook?.name || "导入词库",
    schema,
    entries,
    warnings,
    meta: parsed.wordbookMeta?.meta,
    description: parsed.wordbookMeta?.description,
    tags: parsed.wordbookMeta?.tags ?? [],
    schemaOrigin,
  };
}

/* ---------------- 检索草稿 → 词条值 ---------------- */

export function draftToValues(
  draftValues: Record<string, unknown>,
  schema: Schema,
  existing: Record<string, unknown> = {},
  options: { overwrite?: boolean; keepExtras?: boolean } = {},
): { values: Record<string, unknown>; added: string[]; skipped: string[] } {
  const { overwrite = true, keepExtras = false } = options;
  const values = { ...existing };
  const added: string[] = [];
  const skipped: string[] = [];
  for (const section of schema.sections) {
    const raw = draftValues[section.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const nv = normalizeValue(section.type, raw);
    if (isValueEmpty(section.type, nv)) continue;
    if (!overwrite && !isValueEmpty(section.type, values[section.key])) {
      skipped.push(section.key);
      continue;
    }
    values[section.key] = nv;
    added.push(section.key);
  }
  if (keepExtras) {
    const known = new Set(schema.sections.map((s) => s.key));
    for (const [k, v] of Object.entries(draftValues)) {
      if (known.has(k)) continue;
      if (v == null || v === "") continue;
      if (!(k in values)) values[k] = v;
    }
  }
  return { values, added, skipped };
}
