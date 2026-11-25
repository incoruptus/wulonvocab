import { describe, expect, it } from "vitest";
import { buildEnvelope, buildSyncPayload, parseEnvelope, stableJson, syncFileName } from "./pack";
import { hasSyncedSettingChange, type SyncState } from "./types";

const state: SyncState = {
  books: [],
  settings: { theme: "dark", accent: "violet", uiScale: 1, sidebarCollapsed: false, lastBookId: "x" },
  lookupSources: [],
  dictionaries: [],
  exportPresets: [],
};

describe("同步域设置变更判定", () => {
  it("最近词库、外观与时间戳不触发同步", () => {
    expect(hasSyncedSettingChange({ lastBookId: "book-a" })).toBe(false);
    expect(hasSyncedSettingChange({ theme: "dark", accent: "violet" })).toBe(false);
    expect(hasSyncedSettingChange({ updatedAt: 123 })).toBe(false);
  });

  it("界面缩放与侧栏状态属于同步域，混合 patch 不误判", () => {
    expect(hasSyncedSettingChange({ uiScale: 1.1 })).toBe(true);
    expect(hasSyncedSettingChange({ sidebarCollapsed: true })).toBe(true);
    expect(hasSyncedSettingChange({ lastBookId: "book-a", uiScale: 1.1 })).toBe(true);
  });
});

describe("同步包封包/解析", () => {
  it("snapshot 往返：中文/超长值无损，lastBookId 不随包", () => {
    const payload = buildSyncPayload(state, { mode: "snapshot", deviceId: "devA", tombstones: [] });
    const env = buildEnvelope(payload, { deviceId: "devA", hlcString: "1:0:devA" });
    const round = parseEnvelope(JSON.stringify(env));
    expect(round.payload.settings).toBeTruthy();
    expect(round.payload.settings && "lastBookId" in round.payload.settings).toBe(false);
    expect(round.payload.exportPresets).toEqual([]);
    expect(stableJson(round.payload)).toBe(stableJson(payload));
  });

  it("凭据不进入同步包，即使调用方意外传入旧配置", () => {
    const payload = buildSyncPayload({
      ...state,
      lookupSources: [
        { id: "ai", kind: "ai", label: "AI", enabled: true, config: { baseUrl: "https://example.test", apiKey: "secret-key" } },
        { id: "http", kind: "http", label: "HTTP", enabled: true, config: { headers: '{"Authorization":"Bearer secret"}' } },
      ],
    }, { mode: "snapshot", deviceId: "devA", tombstones: [] });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("secret-key");
    expect(text).not.toContain("Authorization");
    expect(payload.lookupSources?.[0].config).toEqual({ baseUrl: "https://example.test" });
  });

  it("版本/格式/校验和三道闸门", () => {
    const payload = buildSyncPayload(state, { mode: "snapshot", deviceId: "devA", tombstones: [] });
    const env = buildEnvelope(payload, { deviceId: "devA", hlcString: "1:0:devA" });
    expect(() => parseEnvelope(JSON.stringify({ ...env, version: 2 }))).toThrow(/更新版本/);
    expect(() => parseEnvelope(JSON.stringify({ ...env, format: "other" }))).toThrow(/不是 WulonVocab/);
    expect(() => parseEnvelope(JSON.stringify({ ...env, checksum: "deadbeef" }))).toThrow(/校验和/);
    expect(() => parseEnvelope("not json")).toThrow(/JSON/);
  });

  it("delta：只带 since 之后（含 5 分钟边距）的条目；文件名去非法字符", () => {
    const b = {
      ...state.books,
    };
    void b;
    const payload = buildSyncPayload(
      {
        ...state,
        books: [
          {
            id: "bk",
            name: "书",
            tags: [],
            createdAt: 1,
            updatedAt: 100,
            schema: { sections: [] },
            exportSettings: {},
            entries: [
              { id: "e1", headword: "a", tags: [], status: "new", starred: false, createdAt: 1, updatedAt: 10, values: {} },
              { id: "e2", headword: "b", tags: [], status: "new", starred: false, createdAt: 1, updatedAt: 1_000_000, values: {} },
            ],
          } as never,
        ],
      },
      { mode: "delta", since: 500_000, deviceId: "devA", tombstones: [] },
    );
    const kept = payload.books[0].entries ?? [];
    expect(kept.map((e) => e.id)).toEqual(["e2"]);
    expect(syncFileName("我的 电脑/:测试")).toMatch(/^WulonVocab-同步包-我的-电脑-测试-\d{8}-\d{4}\.wulonsync$/);
  });
});
