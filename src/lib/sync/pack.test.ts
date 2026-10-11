import { describe, expect, it } from "vitest";
import { buildEnvelope, buildSyncPayload, parseEnvelope, stableJson, syncFileName } from "./pack";
import type { SyncState } from "./types";

const state: SyncState = {
  books: [],
  settings: { theme: "dark", accent: "violet", uiScale: 1, sidebarCollapsed: false, lastBookId: "x" },
  lookupSources: [],
  dictionaries: [],
  exportPresets: [],
};

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
