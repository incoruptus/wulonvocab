/**
 * 同步包工具：稳定序列化 / 快速指纹（合并层三方比较用）/ 载荷与信封构建解析
 * - `stableJson`：键排序序列化（对象/数组/原始值），跨端字节级一致
 * - `quickHash`：FNV-1a 四通道 128-bit 十六进制（非加密；碰撞只会少报一次冲突）
 * - 信封：`format+version` 双闸门 + checksum；P0 crypto 固定 none（未加密文件互传）
 */

import { uid } from "../utils";
import { decryptPayload, encryptPayload, pairIdOf } from "./crypto";
import type { SyncEnvelopeV1, SyncMeta, SyncPayloadV1, SyncState } from "./types";
import { stripLocalSettings, SYNC_FORMAT, SYNC_FORMAT_VERSION } from "./types";

export function stableJson(v: unknown): string {
  return JSON.stringify(sortValue(v));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return v;
}

export function quickHash(v: unknown): string {
  const s = typeof v === "string" ? v : stableJson(v);
  // 四个不同初值的 FNV-1a 通道拼成 128-bit
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const parts: string[] = [];
  for (const seed of seeds) {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, "0"));
  }
  return parts.join("");
}

/* ---------------- UTF-8 安全的 base64 ---------------- */

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decodeBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------------- 负载构建 ---------------- */

export function buildSyncPayload(
  state: SyncState,
  opts: { mode: "snapshot" | "delta"; since?: number | null; deviceId: string; tombstones: SyncMeta["tombstones"] },
): SyncPayloadV1 {
  // 设备本地设置（明暗/强调色）与 lastBookId 一律不出机
  const settings = stripLocalSettings(state.settings);
  const since = opts.mode === "delta" ? (opts.since ?? 0) : null;
  // delta：只带 updatedAt 超过 since 的条目（加 5min 安全边距，防时钟边界漏条目）
  const margin = 5 * 60 * 1000;
  const books = state.books.map((b) => {
    const { entries, ...rest } = b;
    const kept =
      since === null ? entries : entries.filter((e) => e.updatedAt > since - margin);
    return { book: rest, entries: kept };
  });
  return {
    mode: opts.mode,
    since,
    deviceId: opts.deviceId,
    books,
    tombstones: opts.tombstones,
    settings,
    lookupSources: state.lookupSources,
    dictionaries: state.dictionaries,
    exportPresets: state.exportPresets ?? [],
    stats: { books: books.length, entries: books.reduce((n, b) => n + (b.entries?.length ?? 0), 0) },
  };
}

/* ---------------- 信封 ---------------- */

export function buildEnvelope(
  payload: SyncPayloadV1,
  opts: { deviceId: string; hlcString: string; pairId?: string; baseCursor?: string | null },
): SyncEnvelopeV1 {
  const payloadJson = stableJson(payload);
  const encoded = encodeBase64(payloadJson);
  return {
    format: SYNC_FORMAT,
    version: SYNC_FORMAT_VERSION,
    kind: payload.mode,
    packId: uid(),
    deviceId: opts.deviceId,
    hlc: opts.hlcString,
    baseCursor: opts.baseCursor ?? null,
    pairId: opts.pairId ?? "file",
    createdAt: Date.now(),
    crypto: { alg: "none" },
    payload: encoded,
    checksum: quickHash(encoded),
  };
}

export function serializeEnvelope(envelope: SyncEnvelopeV1): string {
  return JSON.stringify(envelope, null, 2);
}

/** 加密信封（Gist 自动档）：配对码 → PBKDF2 → AES-GCM（载荷先 gzip） */
export async function buildEncryptedEnvelope(
  payload: SyncPayloadV1,
  opts: { deviceId: string; hlcString: string; pairCode: string; baseCursor?: string | null },
): Promise<SyncEnvelopeV1> {
  const enc = await encryptPayload(stableJson(payload), opts.pairCode);
  return {
    format: SYNC_FORMAT,
    version: SYNC_FORMAT_VERSION,
    kind: payload.mode,
    packId: uid(),
    deviceId: opts.deviceId,
    hlc: opts.hlcString,
    baseCursor: opts.baseCursor ?? null,
    pairId: pairIdOf(opts.pairCode),
    createdAt: Date.now(),
    crypto: { alg: "AES-GCM", iv: enc.iv, kdf: "PBKDF2-SHA256", iter: enc.iter, gz: enc.gz },
    payload: enc.payloadB64,
    checksum: quickHash(enc.payloadB64),
  };
}

/** 信封公共校验（format/version/checksum 三道闸门），返回已验签的信封 */
function parseEnvelopeBase(text: string): SyncEnvelopeV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("这不是一个同步包（JSON 解析失败）");
  }
  const env = raw as Partial<SyncEnvelopeV1>;
  if (env.format !== SYNC_FORMAT) throw new Error("这不是 WulonVocab 的同步包");
  if (env.version !== SYNC_FORMAT_VERSION) {
    throw new Error("该同步包来自更新版本的 WulonVocab，请先升级后再导入");
  }
  if (typeof env.payload !== "string" || typeof env.checksum !== "string") {
    throw new Error("同步包内容不完整");
  }
  if (quickHash(env.payload) !== env.checksum) throw new Error("同步包校验和不一致（可能被截断或损坏）");
  return env as SyncEnvelopeV1;
}

/** 解析明文信封（文件档）：format/version/checksum 三道校验，失败抛中文错误 */
export function parseEnvelope(text: string): { envelope: SyncEnvelopeV1; payload: SyncPayloadV1 } {
  const env = parseEnvelopeBase(text);
  if (env.crypto?.alg === "AES-GCM") {
    throw new Error("这个同步包已加密，请到「跨端同步」输入配对码后走自动同步");
  }
  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(decodeBase64(env.payload));
  } catch {
    throw new Error("同步包内容无法解码");
  }
  const payload = payloadRaw as Partial<SyncPayloadV1>;
  if (!Array.isArray(payload.books) || !Array.isArray(payload.tombstones)) {
    throw new Error("同步包结构异常");
  }
  return { envelope: env, payload: payload as SyncPayloadV1 };
}

/** 解析信封（可加密）：Gist 档需要配对码；配对码错误与结构异常都给中文错误 */
export async function parseEnvelopeWithCode(
  text: string,
  pairCode: string,
): Promise<{ envelope: SyncEnvelopeV1; payload: SyncPayloadV1 }> {
  const env = parseEnvelopeBase(text);
  let payloadJson: string;
  if (env.crypto?.alg === "AES-GCM") {
    payloadJson = await decryptPayload(env.payload, pairCode, {
      iv: env.crypto.iv,
      iter: env.crypto.iter,
      gz: env.crypto.gz,
    });
  } else {
    try {
      payloadJson = decodeBase64(env.payload);
    } catch {
      throw new Error("同步内容无法解码");
    }
  }
  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(payloadJson);
  } catch {
    throw new Error("同步内容无法解析");
  }
  const payload = payloadRaw as Partial<SyncPayloadV1>;
  if (!Array.isArray(payload.books) || !Array.isArray(payload.tombstones)) {
    throw new Error("同步内容结构异常");
  }
  return { envelope: env, payload: payload as SyncPayloadV1 };
}

export function syncFileName(deviceName: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = deviceName.replace(/[\\/:*?"<>|\s]+/g, "-") || "设备";
  return `WulonVocab-同步包-${safe}-${stamp}.wulonsync`;
}
