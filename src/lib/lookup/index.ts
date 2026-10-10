import type { LookupResult, LookupSourceConfig, Schema } from "../types";
import type { DictionaryAdapter } from "./types";
import { freeDictAdapter } from "./freedict";
import { localDictAdapter } from "./localdict";
import { httpAdapter } from "./http";
import { aiAdapter } from "./ai";
import { zeroDictAdapter } from "./zerodict";
import { youdaoAdapter } from "./youdao";

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
}

export async function runLookup(
  word: string,
  sources: LookupSourceConfig[],
  schema: Schema,
  options: RunLookupOptions = {},
): Promise<LookupResult[]> {
  const targets = sources.filter((s) => s.enabled);
  const results = await Promise.all(
    targets.map(async (source): Promise<LookupResult> => {
      const started = performance.now();
      const base = {
        sourceId: source.id,
        sourceLabel: source.label,
        kind: source.kind,
        word,
      };
      if (source.kind === "localdict" && !(options.localDictIds?.length)) {
        return { ...base, ok: false, error: "尚未导入本地词库", tookMs: 0 };
      }
      try {
        const adapter = adapterFor(source.kind);
        const config =
          source.kind === "localdict"
            ? { ...source.config, ids: (options.localDictIds ?? []).join(",") }
            : source.config;
        const draft = await adapter.lookup({ word, schema, config, signal: options.signal });
        return { ...base, ok: true, draft, tookMs: Math.round(performance.now() - started) };
      } catch (e) {
        return {
          ...base,
          ok: false,
          error: (e as Error).message || "检索失败",
          tookMs: Math.round(performance.now() - started),
        };
      }
    }),
  );
  return results;
}
