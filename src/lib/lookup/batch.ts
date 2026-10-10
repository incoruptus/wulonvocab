import type { LookupResult, LookupSourceConfig, Schema } from "../types";
import { runLookup } from "./index";

/**
 * 批量检索引擎（补全空缺 / 批量导入 / 文本导入共用）
 * ------------------------------------------------------------
 * 并发池（默认 3 路）+ 进度回调 + 可中止；每个任务取第一个成功源。
 * 内部走 runLookup，因此自动享受 L2 缓存与每源超时。
 */

export interface BatchLookupTask {
  /** 调用方标识（如词条 id 或单词本身） */
  key: string;
  word: string;
}

export interface BatchLookupItem {
  key: string;
  word: string;
  /** 第一个成功源的结果 */
  best?: LookupResult;
  error?: string;
}

export interface BatchLookupOptions {
  sources: LookupSourceConfig[];
  schema: Schema;
  localDictIds?: string[];
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, item: BatchLookupItem) => void;
}

export async function runBatchLookup(tasks: BatchLookupTask[], options: BatchLookupOptions): Promise<BatchLookupItem[]> {
  const { sources, schema, localDictIds, concurrency = 3, signal, onProgress } = options;
  const items: BatchLookupItem[] = tasks.map((t) => ({ key: t.key, word: t.word }));
  if (!tasks.length) return items;

  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (!signal?.aborted) {
      const i = cursor;
      cursor += 1;
      if (i >= tasks.length) return;
      const item = items[i];
      try {
        const res = await runLookup(item.word, sources, schema, { localDictIds, signal });
        const best = res.find((r) => r.ok && r.draft);
        items[i] = best ? { ...item, best } : { ...item, error: res.length ? "未匹配到内容" : "没有可用的数据源" };
      } catch (e) {
        items[i] = { ...item, error: (e as Error).message || "检索失败" };
      }
      done += 1;
      onProgress?.(done, tasks.length, items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return items;
}
