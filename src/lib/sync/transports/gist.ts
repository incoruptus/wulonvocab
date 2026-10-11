/**
 * Gist 传输（P1 自动档 · 零服务器）
 * ------------------------------------------------------------
 * - api.github.com 国内直连可用且 CORS 齐全（R5 实测）；secret gist ≠ 私密 → 一律上传密文；
 * - 单文件 > 460KB 自动分片：主文件存分片清单，part-N 存内容（规避 API 1MB 截断）；
 * - 读取必须走 API JSON（raw.githubusercontent.com 国内不通）。
 */

import { withTimeout } from "../../lookup/types";
import { quickHash, stableJson } from "../pack";
import { pairIdOf } from "../crypto";
import type { SyncGistConfig } from "../types";

const API = "https://api.github.com";
export const GIST_FILE_MAIN = "wulonvocab-sync.json";
export const GIST_CHUNK_CHARS = 460_000; // 信封为纯 ASCII（base64），字符数≈字节数
const DESCRIPTION_PREFIX = "WulonVocab 跨端同步";

export interface GistPullResult {
  text: string;
  revision: string;
  fileNames: string[];
}

/* ---------------- 分片（纯函数，供测试） ---------------- */

export function splitEnvelopeForGist(text: string): { main: string; parts: string[] } | null {
  if (text.length <= GIST_CHUNK_CHARS) return null;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += GIST_CHUNK_CHARS) parts.push(text.slice(i, i + GIST_CHUNK_CHARS));
  const main = stableJson({ format: "wulonvocab-sync-chunks", version: 1, parts: parts.length, checksum: quickHash(text) });
  return { main, parts };
}

export function isChunkManifest(mainText: string): boolean {
  try {
    const m = JSON.parse(mainText) as { format?: unknown };
    return m?.format === "wulonvocab-sync-chunks";
  } catch {
    return false;
  }
}

function chunkName(i: number): string {
  return `wulonvocab-sync.part-${i}`;
}

export function joinGistParts(mainText: string, parts: (string | undefined)[]): string {
  const m = JSON.parse(mainText) as { format: string; version: number; parts: number; checksum: string };
  if (m.format !== "wulonvocab-sync-chunks" || m.version !== 1) throw new Error("同步分片清单格式异常");
  const missing = [...Array(m.parts).keys()].filter((i) => typeof parts[i] !== "string");
  if (missing.length) throw new Error(`同步分片不完整（缺 ${missing.length} 片），另一端可能还没上传完`);
  const text = parts.slice(0, m.parts).join("");
  if (quickHash(text) !== m.checksum) throw new Error("同步分片校验和不一致，另一端可能还在上传中，稍后再同步一次");
  return text;
}

/* ---------------- fetch 封装与错误分诊 ---------------- */

function mapStatus(status: number): string {
  if (status === 401) return "GitHub Token 无效或已过期，去 GitHub 重新生成后粘贴";
  if (status === 404) return "找不到同步仓库（可能已被删除），删掉 Token 旁的仓库号即可重新创建";
  if (status === 403 || status === 429) return "GitHub 接口限流了，休息几分钟再试";
  if (status === 422) return "GitHub 拒绝了这次写入（内容可能超限）";
  return `GitHub 返回了 ${status}`;
}

async function request(cfg: SyncGistConfig, path: string, init: RequestInit = {}, ms = 25_000): Promise<unknown> {
  const { signal, done } = withTimeout(ms);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...((init.headers as Record<string, string>) ?? {}),
      },
      signal,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/超时|abort/i.test(msg)) throw new Error("连接 GitHub 超时，稍后再试");
    throw new Error("连不上 GitHub，检查网络或代理设置");
  } finally {
    done();
  }
  if (!res.ok) throw new Error(mapStatus(res.status));
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    throw new Error("GitHub 返回了无法解析的内容");
  }
}

interface GistFile {
  content?: string;
  truncated?: boolean;
}

interface GistResponse {
  id: string;
  updated_at: string;
  files?: Record<string, GistFile | null>;
}

/* ---------------- 推送 / 拉取 ---------------- */

export interface GistPushResult {
  gistId: string;
  revision: string;
}

/**
 * 推送整包密文：
 * - 无 gistId → POST 创建（secret gist）；有 → PATCH 更新；
 * - 分片切换时自动清理旧的 part-N（existingFiles 由刚拉取的一侧提供，避免多余请求）。
 */
export async function gistPush(
  cfg: SyncGistConfig,
  envelopeText: string,
  opts: { existingFiles?: string[] } = {},
): Promise<GistPushResult> {
  const split = splitEnvelopeForGist(envelopeText);
  const files: Record<string, { content: string } | null> = {};
  if (split) {
    files[GIST_FILE_MAIN] = { content: split.main };
    split.parts.forEach((p, i) => {
      files[chunkName(i)] = { content: p };
    });
  } else {
    files[GIST_FILE_MAIN] = { content: envelopeText };
  }
  const keep = new Set(Object.keys(files));
  for (const name of opts.existingFiles ?? []) {
    if (name.startsWith("wulonvocab-sync.part-") && !keep.has(name)) files[name] = null; // 删除多余旧分片
  }
  const body = JSON.stringify({
    description: `${DESCRIPTION_PREFIX} · ${pairIdOf(cfg.pairCode)}`,
    files,
  });
  const gist = (await request(cfg, cfg.gistId ? `/gists/${cfg.gistId}` : "/gists", {
    method: cfg.gistId ? "PATCH" : "POST",
    body,
  })) as GistResponse;
  return { gistId: gist.id, revision: gist.updated_at };
}

/**
 * 拉取整包密文；主文件不存在（另一端尚未推送）返回 null。
 * 分片模式在主文件清单指引下拼回全文。
 */
export async function gistPull(cfg: SyncGistConfig): Promise<GistPullResult | null> {
  if (!cfg.gistId) return null;
  const gist = (await request(cfg, `/gists/${cfg.gistId}`)) as GistResponse;
  const files = gist.files ?? {};
  const main = files[GIST_FILE_MAIN]?.content;
  if (typeof main !== "string") return null;
  const fileNames = Object.keys(files);
  if (isChunkManifest(main)) {
    const manifest = JSON.parse(main) as { parts: number };
    const parts = [...Array(manifest.parts).keys()].map((i) => files[chunkName(i)]?.content);
    return { text: joinGistParts(main, parts), revision: gist.updated_at, fileNames };
  }
  return { text: main, revision: gist.updated_at, fileNames };
}

export interface GistCandidate {
  id: string;
  updatedAt: string;
  /** 描述带本配对的标识（本版本创建/更新过）；false = 迁移期旧中转站 */
  exact: boolean;
}

/**
 * 在当前账号里发现「本配对」的中转站（Gist 由任一设备创建，其余设备认领共用）。
 * 三端实测缺陷：此前各端首同步都会 POST 新建自己的 Gist、gistId 从不共享，
 * 导致每台设备都在和自己的私有中转站对话（手动同步也永远"没有生效"）。
 */
export async function gistFind(cfg: SyncGistConfig): Promise<GistCandidate[]> {
  const list = (await request(cfg, "/gists?per_page=100")) as Array<{
    id: string;
    description?: string | null;
    updated_at: string;
    files?: Record<string, unknown> | null;
  }>;
  const tag = pairIdOf(cfg.pairCode);
  const exclude = new Set(cfg.excludeGistIds ?? []);
  return list
    .filter((g) => g.files && GIST_FILE_MAIN in g.files && !exclude.has(g.id))
    .map((g) => ({ id: g.id, updatedAt: g.updated_at, exact: (g.description ?? "").includes(tag) }))
    .sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
}
