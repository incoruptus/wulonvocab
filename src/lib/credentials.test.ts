import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookupSourceConfig } from "./types";

const idb = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  createStore: (name: string) => name,
  get: vi.fn(async (key: string, store: string) => idb.values.get(`${store}:${key}`)),
  set: vi.fn(async (key: string, value: unknown, store: string) => { idb.values.set(`${store}:${key}`, value); }),
  del: vi.fn(async (key: string, store: string) => { idb.values.delete(`${store}:${key}`); }),
  clear: vi.fn(async (store: string) => {
    for (const key of idb.values.keys()) if (key.startsWith(`${store}:`)) idb.values.delete(key);
  }),
}));
vi.mock("idb-keyval", () => idb);

import {
  clearSourceCredentials,
  migrateLegacyLookupCredentials,
  saveSourceCredentials,
  splitSourceCredentials,
  withSourceCredentials,
} from "./credentials";

const ai: LookupSourceConfig = {
  id: "ai1", kind: "ai", label: "AI", enabled: true,
  config: { baseUrl: "https://example.test/v1", model: "flash", apiKey: "secret-key", language: "中文" },
};
const http: LookupSourceConfig = {
  id: "http1", kind: "http", label: "HTTP", enabled: true,
  config: { urlTemplate: "https://example.test/{word}", headers: '{"Authorization":"Bearer secret"}', method: "GET" },
};

beforeEach(() => {
  idb.values.clear();
  vi.clearAllMocks();
});

describe("数据源凭据隔离", () => {
  it("拆分 API Key 与请求头，保留其余同步配置且不修改输入", () => {
    expect(splitSourceCredentials(ai)).toEqual({
      source: { ...ai, config: { baseUrl: "https://example.test/v1", model: "flash", language: "中文" } },
      credentials: { apiKey: "secret-key" },
    });
    expect(splitSourceCredentials(http).credentials).toEqual({ headers: '{"Authorization":"Bearer secret"}' });
    expect(ai.config.apiKey).toBe("secret-key");
    expect(http.config.headers).toContain("Bearer");
  });

  it("凭据写入独立本机库，仅在请求运行时注入", async () => {
    await saveSourceCredentials(ai.id, { apiKey: "secret-key" });
    const runtime = await withSourceCredentials({ ...ai, config: { baseUrl: ai.config.baseUrl, model: ai.config.model } });
    expect(runtime.config.apiKey).toBe("secret-key");
    expect(idb.values.has("wulonvocab-v1:ai1")).toBe(false);
    expect(idb.values.has("wulonvocab-credentials-v1:ai1")).toBe(true);
  });

  it("旧凭据迁移后主配置不再含密钥，已有本机值不被旧副本覆盖", async () => {
    await saveSourceCredentials(ai.id, { apiKey: "new-local-key" });
    const migrated = await migrateLegacyLookupCredentials([ai]);
    expect(migrated[0].config).not.toHaveProperty("apiKey");
    expect((await withSourceCredentials(migrated[0])).config.apiKey).toBe("new-local-key");
  });

  it("主动清空凭据后不会被主库旧副本重新迁移回来", async () => {
    await saveSourceCredentials(ai.id, { apiKey: "secret-key" });
    await saveSourceCredentials(ai.id, { apiKey: "" });
    expect((await withSourceCredentials({ ...ai, config: { baseUrl: ai.config.baseUrl, model: ai.config.model } })).config.apiKey).toBe("");
    expect(idb.values.get("wulonvocab-credentials-v1:ai1")).toEqual({ apiKey: "" });
    await clearSourceCredentials();
    expect(idb.values.size).toBe(0);
  });
});
