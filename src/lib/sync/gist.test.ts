import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GIST_CHUNK_CHARS,
  GIST_FILE_MAIN,
  gistFind,
  gistPull,
  gistPush,
  isChunkManifest,
  joinGistParts,
  splitEnvelopeForGist,
} from "./transports/gist";
import { pairIdOf } from "./crypto";
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
  it("无 gistId → POST 创建，返回新 gist id；文件内容完整、描述带配对标识", async () => {
    let posted: { method?: string; files?: Record<string, { content: string } | null>; description?: string } = {};
    stubFetch((_url, init) => {
      const parsed = JSON.parse(String(init.body));
      posted = { method: init.method, files: parsed.files, description: parsed.description };
      return { status: 201, body: { id: "g123", updated_at: "2026-10-11T00:00:00Z" } };
    });
    const res = await gistPush(CFG, "short-envelope");
    expect(res).toEqual({ gistId: "g123", revision: "2026-10-11T00:00:00Z" });
    expect(posted.method).toBe("POST");
    expect(posted.files?.[GIST_FILE_MAIN]?.content).toBe("short-envelope");
    expect(posted.description).toContain(pairIdOf(CFG.pairCode)); // 描述带配对标识：其他设备靠它发现共用中转站
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

describe("gistFind（中转站发现）", () => {
  it("只认带主文件的 Gist；exact（描述带本配对标识）优先，其次按更新时间新→旧", async () => {
    const tag = pairIdOf(CFG.pairCode);
    stubFetch(() => ({
      status: 200,
      body: [
        { id: "g_other", description: "别人的小抄", updated_at: "2026-10-11T05:00:00Z", files: { "notes.md": {} } }, // 无主文件 → 排除
        { id: "g_legacy", description: "WulonVocab 跨端同步（密文）", updated_at: "2026-10-11T04:00:00Z", files: { [GIST_FILE_MAIN]: {} } },
        { id: "g_exact_old", description: `WulonVocab 跨端同步 · ${tag}`, updated_at: "2026-10-11T01:00:00Z", files: { [GIST_FILE_MAIN]: {} } },
        { id: "g_exact_new", description: `WulonVocab 跨端同步 · ${tag}`, updated_at: "2026-10-11T03:00:00Z", files: { [GIST_FILE_MAIN]: {} } },
      ],
    }));
    const list = await gistFind(CFG);
    expect(list.map((c) => c.id)).toEqual(["g_exact_new", "g_exact_old", "g_legacy"]);
    expect(list[0].exact).toBe(true);
    expect(list[2].exact).toBe(false);
  });

  it("excludeGistIds 的中转站被跳过（「重新创建」后不再认领旧站）", async () => {
    const tag = pairIdOf(CFG.pairCode);
    stubFetch(() => ({
      status: 200,
      body: [{ id: "g_old", description: `WulonVocab 跨端同步 · ${tag}`, updated_at: "2026-10-11T03:00:00Z", files: { [GIST_FILE_MAIN]: {} } }],
    }));
    expect(await gistFind({ ...CFG, excludeGistIds: ["g_old"] })).toHaveLength(0);
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
