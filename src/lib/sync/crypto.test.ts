import { describe, expect, it } from "vitest";
import {
  decryptPayload,
  encryptPayload,
  generatePairCode,
  isPairCodeWellFormed,
  normalizePairCode,
  pairIdOf,
} from "./crypto";
import { buildEncryptedEnvelope, parseEnvelope, parseEnvelopeWithCode, serializeEnvelope, stableJson } from "./pack";
import type { SyncPayloadV1 } from "./types";

function samplePayload(): SyncPayloadV1 {
  return {
    mode: "snapshot",
    since: null,
    deviceId: "dev-a",
    books: [{ book: { id: "b1", name: "测试词库", tags: [], createdAt: 1, updatedAt: 2 } as never, entries: [] }],
    tombstones: [],
    stats: { books: 1, entries: 0 },
  };
}

const TEXT = "同步内容·压缩测试 ".repeat(50);

describe("配对码", () => {
  it("生成即合规，归一化可重新分组", () => {
    const code = generatePairCode();
    expect(isPairCodeWellFormed(code)).toBe(true);
    expect(isPairCodeWellFormed("AAAA-BBBB-CCCC-DDDD-EEEE")).toBe(true);
    expect(isPairCodeWellFormed("AAAA-BBBB-CCCC-DDDD")).toBe(false);
    expect(normalizePairCode("abcd efgh ijkl mnop qrst")).toBe("ABCD-EFGH-IJKL-MNOP-QRST");
  });

  it("配对标识稳定且不含秘密明文", () => {
    expect(pairIdOf("AAAA-BBBB-CCCC-DDDD-EEEE")).toBe(pairIdOf("aaaabbbbccccddddeeee"));
    expect(pairIdOf("AAAA-BBBB-CCCC-DDDD-EEEE")).toMatch(/^pair-[0-9a-f]{8}$/);
  });
});

describe("载荷加解密", () => {
  it("同一配对码可解回原文；错误配对码给出中文错误", async () => {
    const code = generatePairCode();
    const enc = await encryptPayload(TEXT, code);
    expect(enc.payloadB64).not.toContain("同步内容");
    const back = await decryptPayload(enc.payloadB64, code, enc);
    expect(back).toBe(TEXT);
    await expect(decryptPayload(enc.payloadB64, generatePairCode(), enc)).rejects.toThrow(/配对码/);
  });
});

describe("加密信封（Gist 档）", () => {
  it("构建 → 序列化 → 带配对码解析：载荷往返一致", async () => {
    const code = generatePairCode();
    const payload = samplePayload();
    const envelope = await buildEncryptedEnvelope(payload, {
      deviceId: "dev-a",
      hlcString: "1:0:dev-a",
      pairCode: code,
    });
    expect(envelope.crypto.alg).toBe("AES-GCM");
    const text = serializeEnvelope(envelope);
    expect(text).not.toContain("测试词库"); // 密文里不得出现明文
    const parsed = await parseEnvelopeWithCode(text, code);
    expect(stableJson(parsed.payload)).toBe(stableJson(payload));
    expect(parsed.envelope.pairId).toBe(pairIdOf(code));
  });

  it("明文解析器遇到加密信封给中文指引；错误配对码报错；篡改校验和报错", async () => {
    const code = generatePairCode();
    const envelope = await buildEncryptedEnvelope(samplePayload(), { deviceId: "d", hlcString: "1:0:d", pairCode: code });
    const text = serializeEnvelope(envelope);
    expect(() => parseEnvelope(text)).toThrow(/已加密/);
    await expect(parseEnvelopeWithCode(text, generatePairCode())).rejects.toThrow(/配对码/);
    const tampered = JSON.stringify({ ...envelope, payload: `${envelope.payload}x` });
    await expect(parseEnvelopeWithCode(tampered, code)).rejects.toThrow(/校验和/);
  });
});
