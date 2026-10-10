import { createStore, del, get, set } from "idb-keyval";
import type { LookupResult, LookupSourceConfig, Schema } from "../types";

/**
 * 检索结果缓存（L2 · IndexedDB）
 * ------------------------------------------------------------
 * 同一单词 + 同一「启用源集合与配置指纹 + schema 键指纹」下，30 天内直接命中，
 * 命中 <10ms 先渲染，显著缓解「网络综合词典检索太慢」（issue #2）。
 * 只缓存至少有一个成功源的结果；全部失败不缓存（避免瞬时故障被固化）。
 * 提供 clearLookupCache 供设置页/调试使用。
 */

const store = createStore("wulonvocab-lookup-cache", "kv");
export const LOOKUP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  results: LookupResult[];
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function fingerprint(sources: LookupSourceConfig[], schema: Schema): string {
  const sourcesRaw = sources
    .filter((s) => s.enabled)
    .map((s) => `${s.kind}:${JSON.stringify(s.config)}`)
    .join("|");
  const schemaKeys = schema.sections.map((sec) => sec.key).join(",");
  return `${djb2(sourcesRaw)}-${djb2(schemaKeys)}`;
}

function keyFor(word: string, sources: LookupSourceConfig[], schema: Schema): string {
  return `${word.toLowerCase()}::${fingerprint(sources, schema)}`;
}

export async function readLookupCache(
  word: string,
  sources: LookupSourceConfig[],
  schema: Schema,
): Promise<{ results: LookupResult[]; at: number } | null> {
  try {
    const res = await get<CacheEntry>(keyFor(word, sources, schema), store);
    if (!res) return null;
    if (Date.now() - res.at > LOOKUP_CACHE_TTL_MS) {
      void del(keyFor(word, sources, schema), store);
      return null;
    }
    return res;
  } catch {
    return null;
  }
}

export async function writeLookupCache(
  word: string,
  sources: LookupSourceConfig[],
  schema: Schema,
  results: LookupResult[],
): Promise<void> {
  if (!results.some((r) => r.ok)) return;
  try {
    await set(
      keyFor(word, sources, schema),
      { at: Date.now(), results: results.map((r) => ({ ...r, fromCache: true })) } satisfies CacheEntry,
      store,
    );
  } catch {
    /* 缓存写入失败不影响检索 */
  }
}

export async function clearLookupCache(): Promise<void> {
  try {
    const { clear } = await import("idb-keyval");
    await clear(store);
  } catch {
    /* ignore */
  }
}
