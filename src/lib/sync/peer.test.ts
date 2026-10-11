import { describe, expect, it } from "vitest";
import { chunkEnvelope, derivePeerId, joinEnvelopeChunks, PEER_CHUNK_CHARS } from "./transports/peer";
import { quickHash } from "./pack";

describe("derivePeerId（会话码 → 信令房间号）", () => {
  it("确定性推导、格式合法（大小写/分隔符不敏感）", () => {
    const a = derivePeerId("ABCD-EFGH-IJKL-MNOP-QRST");
    expect(a).toBe(derivePeerId("abcd efgh ijkl mnop qrst"));
    expect(a).toMatch(/^wv-[0-9a-z]+-[0-9a-z]+$/);
    expect(derivePeerId("ABCD-EFGH-IJKL-MNOP-QRSU")).not.toBe(a);
  });
});

describe("分片协议（纯函数）", () => {
  it("短包单片；长包按 40k 分片并可校验拼回", () => {
    expect(chunkEnvelope("short")).toEqual(["short"]);
    const text = "x".repeat(PEER_CHUNK_CHARS * 2 + 17);
    const parts = chunkEnvelope(text);
    expect(parts).toHaveLength(3);
    expect(joinEnvelopeChunks(parts, quickHash(text))).toBe(text);
  });

  it("校验和不一致给出中文错误", () => {
    expect(() => joinEnvelopeChunks(["abc"], quickHash("abd"))).toThrow(/校验/);
  });
});
