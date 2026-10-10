import { createStore, del, get, keys, set } from "idb-keyval";
import type { LocalDictMeta, LookupDraft } from "../types";
import { canonicalKey } from "../sections";
import { mapRowToSchema } from "../infer";
import { isPlainObject, uid } from "../utils";
import type { ParsedImport } from "../importer";
import { ecDictRowToValues, isEcDictRow } from "../importer";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError } from "./types";

/* ============================================================
   本地词典存储：IndexedDB（独立于主状态，避免拖慢应用）
   ============================================================ */

const dictStore = createStore("wulonvocab-dicts", "dicts");

export interface LocalDictRow {
  w: string;
  entry: Record<string, unknown>;
}

export interface LocalDictData {
  meta: LocalDictMeta;
  rows: LocalDictRow[];
}

export async function saveLocalDictionary(meta: LocalDictMeta, rows: LocalDictRow[]): Promise<void> {
  await set(meta.id, { meta, rows }, dictStore);
}

export async function loadLocalDictionary(id: string): Promise<LocalDictData | undefined> {
  const data = await get<LocalDictData>(id, dictStore);
  return data;
}

export async function deleteLocalDictionaryData(id: string): Promise<void> {
  await del(id, dictStore);
}

export async function listLocalDictionaryIds(): Promise<string[]> {
  return (await keys(dictStore)) as string[];
}

/* ---------------- 内存缓存与检索 ---------------- */

const cache = new Map<string, LocalDictData>();

export async function ensureDictionaryLoaded(id: string): Promise<LocalDictData | undefined> {
  if (cache.has(id)) return cache.get(id);
  const data = await loadLocalDictionary(id);
  if (data) cache.set(id, data);
  return data;
}

export function dropDictionaryCache(id: string) {
  cache.delete(id);
}

function lowerBound(rows: LocalDictRow[], target: string): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].w < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export async function searchLocalDictionary(
  id: string,
  word: string,
): Promise<{ row: LocalDictRow | undefined; suggestions: string[] }> {
  const data = await ensureDictionaryLoaded(id);
  if (!data) return { row: undefined, suggestions: [] };
  const target = word.trim().toLowerCase();
  const rows = data.rows;
  const idx = lowerBound(rows, target);
  if (idx < rows.length && rows[idx].w === target) {
    return { row: rows[idx], suggestions: [] };
  }
  const suggestions: string[] = [];
  for (let i = idx; i < rows.length && suggestions.length < 12; i += 1) {
    if (!rows[i].w.startsWith(target)) break;
    suggestions.push(rows[i].w);
  }
  return { row: undefined, suggestions };
}

/* ---------------- 导入 ---------------- */

const META_RESERVED = new Set(["headword", "word", "term", "spelling", "expression", "单词", "tag", "tags"].map(canonicalKey));

export function buildLocalDictRows(parsed: ParsedImport): LocalDictRow[] {
  const rows: LocalDictRow[] = [];
  for (const row of parsed.rows) {
    const wordRaw =
      row.headword ?? row.word ?? row.term ?? row["单词"] ??
      Object.entries(row).find(([k]) => ["headword", "word", "term", "单词"].includes(canonicalKey(k)))?.[1];
    const word = typeof wordRaw === "string" ? wordRaw.trim() : "";
    if (!word) continue;
    let entry: Record<string, unknown>;
    if (parsed.kind === "ecdict" || isEcDictRow(row)) {
      const { values } = ecDictRowToValues(row);
      entry = { ...values };
      const tag = row.tag ?? row.tags;
      if (tag != null) entry["__tags"] = String(tag);
    } else if (isPlainObject(row.values)) {
      entry = { ...(row.values as Record<string, unknown>) };
    } else {
      entry = {};
      for (const [k, v] of Object.entries(row)) {
        if (META_RESERVED.has(canonicalKey(k))) continue;
        entry[k] = v;
      }
    }
    rows.push({ w: word.toLowerCase(), entry });
  }
  rows.sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
  return rows;
}

export function makeDictionaryMeta(name: string, source: string, count: number, note?: string): LocalDictMeta {
  return { id: uid(), name, source, count, importedAt: Date.now(), note };
}

/* ---------------- 适配器 ---------------- */

export const localDictAdapter: DictionaryAdapter = {
  kind: "localdict",
  async lookup({ word, schema, config }: LookupContext): Promise<LookupDraft> {
    const ids = (config.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) throw new LookupError("尚未导入本地词库（设置 → 本地词库）");
    for (const id of ids) {
      const { row } = await searchLocalDictionary(id, word);
      if (row) {
        const data = await ensureDictionaryLoaded(id);
        const merged: Record<string, unknown> = { headword: word, ...row.entry };
        const { values } = mapRowToSchema(merged, schema);
        const tagRaw = row.entry["__tags"];
        delete merged["__tags"];
        void tagRaw;
        return {
          values,
          summary: {
            headword: word,
            posList: Array.isArray(values.senses)
              ? [...new Set((values.senses as { pos?: string }[]).map((s) => s.pos).filter(Boolean) as string[])]
              : [],
            definitions: Array.isArray(values.senses)
              ? (values.senses as { translation?: string; definition?: string }[])
                  .slice(0, 3)
                  .map((s) => s.translation || s.definition || "")
                  .filter(Boolean)
              : [],
          },
          suggestedTags: data ? [data.meta.name] : ["本地词库"],
        };
      }
    }
    throw new LookupError("本地词库中未找到该单词");
  },
};
