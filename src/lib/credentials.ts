import { createStore, del, get, set } from "idb-keyval";
import type { LookupSourceConfig } from "./types";

/**
 * 数据源凭据独立保管：API Key 与自定义 HTTP 请求头只进入本机 IDB。
 * 主 store、撤销历史、同步包与备份始终只持有剥掉凭据的数据源配置。
 */
const credentialStore = createStore("wulonvocab-credentials-v1", "kv");

export type SourceCredentials = Record<string, string>;

export function splitSourceCredentials(source: LookupSourceConfig): {
  source: LookupSourceConfig;
  credentials: SourceCredentials;
} {
  const config = { ...source.config };
  const credentials: SourceCredentials = {};
  if (typeof config.apiKey === "string") {
    credentials.apiKey = config.apiKey;
    delete config.apiKey;
  }
  if (typeof config.headers === "string") {
    credentials.headers = config.headers;
    delete config.headers;
  }
  return { source: { ...source, config }, credentials };
}

export function stripSourceCredentials(source: LookupSourceConfig): LookupSourceConfig {
  return splitSourceCredentials(source).source;
}

export function stripLookupSourceCredentials(sources: LookupSourceConfig[]): LookupSourceConfig[] {
  return sources.map(stripSourceCredentials);
}

export async function loadSourceCredentials(sourceId: string): Promise<SourceCredentials> {
  return (await get<SourceCredentials>(sourceId, credentialStore)) ?? {};
}

export async function saveSourceCredentials(sourceId: string, credentials: SourceCredentials): Promise<void> {
  // 保留空对象作为「已主动清空」标记，避免旧主库副本在迁移时把密钥带回来。
  await set(sourceId, credentials, credentialStore);
}

export async function saveLookupSourceCredentials(source: LookupSourceConfig): Promise<void> {
  const { credentials } = splitSourceCredentials(source);
  await saveSourceCredentials(source.id, credentials);
}

export async function deleteSourceCredentials(sourceId: string): Promise<void> {
  await del(sourceId, credentialStore);
}

export async function clearSourceCredentials(): Promise<void> {
  const { clear } = await import("idb-keyval");
  await clear(credentialStore);
}

/** 仅在请求发出前注入凭据；返回值不得写入主 store、缓存或日志。 */
export async function withSourceCredentials(source: LookupSourceConfig): Promise<LookupSourceConfig> {
  if (source.kind !== "ai" && source.kind !== "http") return source;
  const clean = stripSourceCredentials(source);
  const stored = await loadSourceCredentials(source.id);
  const inline = splitSourceCredentials(source).credentials;
  return { ...clean, config: { ...clean.config, ...stored, ...inline } };
}

/**
 * 旧版迁移：独立保管中已有值（包括用户主动清空）优先，不被旧主库里的残留 Key 覆盖。
 * 迁移成功后调用方必须把剥掉凭据的 sources 写回主 store。
 */
export async function migrateLegacyLookupCredentials(sources: LookupSourceConfig[]): Promise<LookupSourceConfig[]> {
  const clean = stripLookupSourceCredentials(sources);
  for (const original of sources) {
    const { credentials } = splitSourceCredentials(original);
    if (!Object.keys(credentials).length) continue;
    const existing = await get<SourceCredentials | undefined>(original.id, credentialStore);
    if (existing === undefined) await saveSourceCredentials(original.id, credentials);
  }
  return clean;
}
