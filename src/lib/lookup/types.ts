import type { LookupDraft, LookupSourceConfig } from "../types";
import type { Schema } from "../types";

export interface LookupContext {
  word: string;
  schema: Schema;
  config: Record<string, string>;
  signal?: AbortSignal;
}

export interface DictionaryAdapter {
  kind: LookupSourceConfig["kind"];
  lookup(ctx: LookupContext): Promise<LookupDraft>;
}

export class LookupError extends Error {}

export function withTimeout(ms: number, signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("超时")), ms);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}
