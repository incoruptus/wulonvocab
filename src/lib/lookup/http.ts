import type { LookupDraft } from "../types";
import { getPath, isPlainObject } from "../utils";
import { normalizeValue } from "../sections";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

export const httpAdapter: DictionaryAdapter = {
  kind: "http",
  async lookup({ word, schema, config, signal }: LookupContext): Promise<LookupDraft> {
    const urlTemplate = (config.urlTemplate ?? "").trim();
    if (!urlTemplate) throw new LookupError("未配置 API 地址模板");
    const url = urlTemplate.includes("{word}")
      ? urlTemplate.replace(/\{word\}/g, encodeURIComponent(word))
      : `${urlTemplate}${urlTemplate.includes("?") ? "&" : "?"}word=${encodeURIComponent(word)}`;

    let headers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(config.headers || "{}") as unknown;
      if (isPlainObject(parsed)) headers = parsed as Record<string, string>;
    } catch {
      throw new LookupError("请求头不是合法 JSON");
    }

    const method = (config.method || "GET").toUpperCase();
    const { signal: s, done } = withTimeout(20000, signal);
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...headers },
        body:
          method === "POST"
            ? config.bodyTemplate
              ? config.bodyTemplate.replace(/\{word\}/g, word)
              : JSON.stringify({ word })
            : undefined,
        signal: s,
      });
      if (!res.ok) throw new LookupError(`请求失败（HTTP ${res.status}）`);
      let data: unknown = await res.json();
      if (Array.isArray(data)) data = data[0];
      if (config.resultPath) data = getPath(data, config.resultPath);
      if (data == null) throw new LookupError("响应路径为空结果");

      let mapping: Record<string, string> = {};
      try {
        const parsed = JSON.parse(config.mapping || "{}") as unknown;
        if (isPlainObject(parsed)) mapping = parsed as Record<string, string>;
      } catch {
        throw new LookupError("字段对照不是合法 JSON");
      }

      const values: Record<string, unknown> = {};
      if (Object.keys(mapping).length) {
        for (const [key, path] of Object.entries(mapping)) {
          const section = schema.sections.find((sec) => sec.key === key);
          const raw = path === "$" ? data : getPath(data, path);
          if (raw == null || raw === "") continue;
          values[key] = section ? normalizeValue(section.type, raw) : raw;
        }
      } else {
        for (const section of schema.sections) {
          const raw = getPath(data, section.key);
          if (raw == null || raw === "") continue;
          values[section.key] = normalizeValue(section.type, raw);
        }
      }
      if (!Object.keys(values).length) throw new LookupError("对照结果为空（检查对照配置）");
      return { values, summary: { headword: word } };
    } finally {
      done();
    }
  },
};
