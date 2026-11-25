import { createStore, del, get, keys, set } from "idb-keyval";

const store = createStore("wulonvocab-quiz-cache-v1", "kv");
const PREFIX = "quiz:";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

interface CacheRecord<T> {
  at: number;
  value: T;
}

export function quizCacheKey(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${PREFIX}${(hash >>> 0).toString(36)}`;
}

export async function readQuizCache<T>(key: string): Promise<T | null> {
  try {
    const record = await get<CacheRecord<T>>(key, store);
    if (!record) return null;
    if (Date.now() - record.at > TTL_MS) {
      const current = await get<CacheRecord<T>>(key, store);
      if (current?.at === record.at) void del(key, store);
      return null;
    }
    return record.value;
  } catch {
    return null;
  }
}

export async function writeQuizCache<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, { at: Date.now(), value } satisfies CacheRecord<T>, store);
    const allKeys = (await keys(store)).filter((item): item is string => typeof item === "string" && item.startsWith(PREFIX));
    if (allKeys.length <= MAX_ENTRIES) return;
    const records = await Promise.all(allKeys.map(async (item) => ({ key: item, record: await get<CacheRecord<T>>(item, store) })));
    const stale = records
      .filter((item) => item.record)
      .sort((a, b) => (a.record?.at ?? 0) - (b.record?.at ?? 0))
      .slice(0, allKeys.length - MAX_ENTRIES);
    await Promise.all(stale.map((item) => del(item.key, store)));
  } catch {
    /* 缓存失败不阻塞学习 */
  }
}

export async function clearQuizCache(): Promise<void> {
  try {
    const allKeys = await keys(store);
    await Promise.all(
      allKeys
        .filter((item): item is string => typeof item === "string" && item.startsWith(PREFIX))
        .map((item) => del(item, store)),
    );
  } catch {
    /* ignore */
  }
}
