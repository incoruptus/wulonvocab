import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GIST_CHUNK_CHARS,
  GIST_FILE_MAIN,
  gistPull,
  gistPush,
  isChunkManifest,
  joinGistParts,
  splitEnvelopeForGist,
} from "./transports/gist";
import type { SyncGistConfig } from "./types";

const CFG: SyncGistConfig = { enabled: true, token: "ghp_test", gistId: null, pairCode: "AAAA-BBBB-CCCC-DDDD-EEEE" };

function stubFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const { status, body } = handler(String(url), init ?? {});
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("分片（纯函数）", () => {
  it("短文本不分片；长文本按 460k 分片且可在另一端拼回", () => {
    expect(splitEnvelopeForGist("short")).toBeNull();
    const text = "a".repeat(GIST_CHUNK_CHARS * 2 + 123);
    const split = splitEnvelopeForGist(text)!;
    expect(split.parts).toHaveLength(3);
    expect(isChunkManifest(split.main)).toBe(true);
    expect(joinGistParts(split.main, split.parts)).toBe(text);
  });

  it("缺片 / 内容不一致给出中文错误", () => {
    const text = "b".repeat(GIST_CHUNK_CHARS + 5);
    const split = splitEnvelopeForGist(text)!;
    expect(() => joinGistParts(split.main, [split.parts[0]])).toThrow(/不完整/);
    expect(() => joinGistParts(split.main, [split.parts[0], "x".repeat(5)])).toThrow(/校验和/);
  });
});

describe("gistPush", () => {
  it("无 gistId → POST 创建，返回新 gist id；文件内容完整", async () => {
    let posted: { method?: string; files?: Record<string, { content: string } | null> } = {};
    stubFetch((_url, init) => {
      posted = { method: init.method, files: JSON.parse(String(init.body)).files };
      return { status: 201, body: { id: "g123", updated_at: "2026-10-11T00:00:00Z" } };
    });
    const res = await gistPush(CFG, "short-envelope");
    expect(res).toEqual({ gistId: "g123", revision: "2026-10-11T00:00:00Z" });
    expect(posted.method).toBe("POST");
    expect(posted.files?.[GIST_FILE_MAIN]?.content).toBe("short-envelope");
  });

  it("有 gistId → PATCH；分片切换时清理旧 part 文件（置 null）", async () => {
    let patched: { method?: string; files?: Record<string, { content: string } | null> } = {};
    stubFetch((_url, init) => {
      patched = { method: init.method, files: JSON.parse(String(init.body)).files };
      return { status: 200, body: { id: "g123", updated_at: "2026-10-11T01:00:00Z" } };
    });
    const long = "c".repeat(GIST_CHUNK_CHARS + 10); // → 2 片
    await gistPush({ ...CFG, gistId: "g123" }, long, {
      existingFiles: [`${GIST_FILE_MAIN}`, "wulonvocab-sync.part-0", "wulonvocab-sync.part-1", "wulonvocab-sync.part-2"],
    });
    expect(patched.method).toBe("PATCH");
    expect(patched.files?.["wulonvocab-sync.part-2"]).toBeNull(); // 旧的第 3 片被清除
    expect(patched.files?.["wulonvocab-sync.part-0"]?.content).toBeTruthy();
    expect(patched.files?.["wulonvocab-sync.part-1"]?.content).toBeTruthy();
  });
});

describe("gistPull", () => {
  it("未配置 gistId 直接返回 null（不发请求）", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await gistPull(CFG)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("分片模式：主清单 + parts 拼回全文，返回修订与文件名", async () => {
    const text = "d".repeat(GIST_CHUNK_CHARS + 3);
    const split = splitEnvelopeForGist(text)!;
    stubFetch(() => ({
      status: 200,
      body: {
        id: "g1",
        updated_at: "rev1",
        files: {
          [GIST_FILE_MAIN]: { content: split.main },
          "wulonvocab-sync.part-0": { content: split.parts[0] },
          "wulonvocab-sync.part-1": { content: split.parts[1] },
        },
      },
    }));
    const res = await gistPull({ ...CFG, gistId: "g1" });
    expect(res?.text).toBe(text);
    expect(res?.revision).toBe("rev1");
    expect(res?.fileNames).toContain("wulonvocab-sync.part-1");
  });

  it("主文件缺失 → null；401 / 404 给中文分诊错误", async () => {
    stubFetch(() => ({ status: 200, body: { id: "g1", updated_at: "rev", files: {} } }));
    expect(await gistPull({ ...CFG, gistId: "g1" })).toBeNull();

    stubFetch(() => ({ status: 401 }));
    await expect(gistPull({ ...CFG, gistId: "g1" })).rejects.toThrow(/Token 无效/);
    stubFetch(() => ({ status: 404 }));
    await expect(gistPull({ ...CFG, gistId: "g1" })).rejects.toThrow(/找不到同步仓库/);
  });
});
