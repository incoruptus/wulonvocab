/**
 * 端到端加密（配对码 → AES-GCM-256，R5 研究 §2.2）
 * ------------------------------------------------------------
 * - 配对码是唯一秘密：本机生成、另一台设备手输同一配对码即可互解；
 * - 密钥派生：PBKDF2-SHA256（60 万次迭代）→ AES-GCM-256，载荷先 gzip 再加密；
 * - Gist 的 secret 不等于私密（知道链接就能读）→ 上传的一律是密文；
 * - Node 18+ / 浏览器同构（crypto.subtle + CompressionStream，缺压缩能力时自动降级为不压缩）。
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉 I / O / 0 / 1 易混字符
export const PAIR_CODE_GROUPS = 5;
export const PAIR_CODE_GROUP_LEN = 4;
export const PBKDF2_ITERATIONS = 600_000;

/** 生成可口头传递的配对码：XXXX-XXXX-XXXX-XXXX-XXXX（≈100 bit 熵） */
export function generatePairCode(): string {
  const bytes = new Uint8Array(PAIR_CODE_GROUPS * PAIR_CODE_GROUP_LEN);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let g = 0; g < PAIR_CODE_GROUPS; g += 1) {
    groups.push(chars.slice(g * PAIR_CODE_GROUP_LEN, (g + 1) * PAIR_CODE_GROUP_LEN).join(""));
  }
  return groups.join("-");
}

/** 归一化：大写、剔除分隔符与易混字符后按 4 位重新分组 */
export function normalizePairCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  return raw.replace(/(.{4})(?=.)/g, "$1-");
}

export function isPairCodeWellFormed(code: string): boolean {
  return /^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/.test(normalizePairCode(code));
}

/** 配对标识（进信封 pairId / 游标键；不含秘密本身） */
export function pairIdOf(pairCode: string): string {
  let h = 0x811c9dc5;
  const s = normalizePairCode(pairCode);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `pair-${h.toString(16).padStart(8, "0")}`;
}

/* ---------------- base64（bytes 级） ---------------- */

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------------- gzip（能力探测，缺失则明文加密） ---------------- */

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === "undefined") throw new Error("浏览器不支持解压该同步内容");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------------- 密钥与加解密 ---------------- */

const KDF_SALT = "wulonvocab-sync-v1";

async function deriveKey(pairCode: string, iterations: number): Promise<CryptoKey> {
  // WebCrypto 只在 HTTPS / localhost 可用：局域网 http（如手机访问 192.168.x.x）会走到这里
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前环境不支持加密，请用 https 或 localhost 打开（浏览器限制）");
  }
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizePairCode(pairCode)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(KDF_SALT), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedPayload {
  payloadB64: string;
  iv: string;
  iter: number;
  gz: boolean;
}

export async function encryptPayload(payloadJson: string, pairCode: string): Promise<EncryptedPayload> {
  const raw: Uint8Array<ArrayBuffer> = new TextEncoder().encode(payloadJson);
  const zipped = await gzip(raw);
  const data = zipped ?? raw;
  const key = await deriveKey(pairCode, PBKDF2_ITERATIONS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return { payloadB64: bytesToB64(cipher), iv: bytesToB64(iv), iter: PBKDF2_ITERATIONS, gz: zipped !== null };
}

export async function decryptPayload(
  payloadB64: string,
  pairCode: string,
  meta: { iv: string; iter: number; gz: boolean },
): Promise<string> {
  const key = await deriveKey(pairCode, meta.iter);
  let plain: Uint8Array<ArrayBuffer>;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(meta.iv) }, key, b64ToBytes(payloadB64)));
  } catch {
    throw new Error("配对码不对（或同步内容已损坏）");
  }
  const raw = meta.gz ? await gunzip(plain) : plain;
  return new TextDecoder().decode(raw);
}
