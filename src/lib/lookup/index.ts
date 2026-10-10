import type { LookupResult, LookupSourceConfig, Schema } from "../types";
import type { DictionaryAdapter } from "./types";
import { withTimeout } from "./types";
import { freeDictAdapter } from "./freedict";
import { localDictAdapter } from "./localdict";
import { httpAdapter } from "./http";
import { aiAdapter } from "./ai";
import { zeroDictAdapter } from "./zerodict";
import { youdaoAdapter } from "./youdao";
import { readLookupCache, writeLookupCache } from "./cache";

const ADAPTERS: Record<LookupSourceConfig["kind"], DictionaryAdapter> = {
  freedict: freeDictAdapter,
  localdict: localDictAdapter,
  http: httpAdapter,
  ai: aiAdapter,
  zerodict: zeroDictAdapter,
  youdao: youdaoAdapter,
};

export function adapterFor(kind: LookupSourceConfig["kind"]): DictionaryAdapter {
  return ADAPTERS[kind];
}

export interface RunLookupOptions {
  localDictIds?: string[];
  signal?: AbortSignal;
  /** 每个源出结果即回调（用于「先到先显示」的渐进渲染） */
  onPartial?: (result: LookupResult) => void;
  /** 跳过缓存强制刷新 */
  bypassCache?: boolean;
  /** 非 AI 源的超时（毫秒），默认 8000；AI 源固定放宽到 180s */
  timeoutMs?: number;
}

const DEFAULT_SOURCE_TIMEOUT_MS = 8000;
const AI_SOURCE_TIMEOUT_MS = 180000;

export async function runLookup(
  word: string,
  sources: LookupSourceConfig[],
  schema: Schema,
  options: RunLookupOptions = {},
): Promise<LookupResult[]> {
  const targets = sources.filter((s) => s.enabled);
  if (!targets.length) return [];

  // L2 缓存：命中即全部同步回调（<10ms 级），UI 秒出结果
  if (!options.bypassCache) {
    const cached = await readLookupCache(word, sources, schema);
    if (cached) {
      cached.results.forEach((r) => options.onPartial?.(r));
      return cached.results;
    }
  }

  const results = await Promise.all(
    targets.map(async (source): Promise<LookupResult> => {
      const started = performance.now();
      const base = {
        sourceId: source.id,
        sourceLabel: source.label,
        kind: source.kind,
        word,
      };
      const finish = (r: LookupResult): LookupResult => {
        options.onPartial?.(r);
        return r;
      };
      if (source.kind === "localdict" && !(options.localDictIds?.length)) {
        return finish({ ...base, ok: false, error: "尚未导入本地词库", tookMs: 0 });
      }
      const timeoutMs = source.kind === "ai" ? AI_SOURCE_TIMEOUT_MS : (options.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS);
      const { signal, done } = withTimeout(timeoutMs, options.signal);
      try {
        const adapter = adapterFor(source.kind);
        const config =
          source.kind === "localdict"
            ? { ...source.config, ids: (options.localDictIds ?? []).join(",") }
            : source.config;
        const draft = await adapter.lookup({ word, schema, config, signal });
        return finish({ ...base, ok: true, draft, tookMs: Math.round(performance.now() - started) });
      } catch (e) {
        const isTimeout = signal.aborted && !options.signal?.aborted;
        return finish({
          ...base,
          ok: false,
          error: isTimeout ? `超时（>${Math.round(timeoutMs / 1000)}s）` : (e as Error).message || "检索失败",
          tookMs: Math.round(performance.now() - started),
        });
      } finally {
        done();
      }
    }),
  );

  // 至少有一个成功源才写缓存（坏结果不固化）
  void writeLookupCache(word, sources, schema, results);
  return results;
}
