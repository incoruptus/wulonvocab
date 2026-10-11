import { describe, expect, it } from "vitest";
import type { AppSettings, Entry, Wordbook } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { newSrs } from "../study/engine";
import { buildSyncPayload, quickHash, stableJson } from "./pack";
import { mergeSync } from "./merge";
import type { BaseHashes, SyncPayloadV1, SyncState } from "./types";

/**
 * 三端仿真（只 mock 掉「Gist 上的最后一个信封」，其余走真实引擎语义）：
 * 精确复刻 src/lib/sync/engine.ts 每轮行为——拉（他端信封）→ 三方合并（base 演进）→ 推（指纹相同跳过）。
 * 覆盖三端实测暴露的问题域：主题色（设置）与学习进度（srs）是否收敛、旧远端是否会覆盖新本地。
 */

const T = 1_000_000;

interface Device {
  id: string;
  state: SyncState;
  base: BaseHashes | null;
  lastPushHash: string | null;
}

interface Gist {
  text: string;
  deviceId: string;
  revision: number;
}

function mkSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return { theme: "light", accent: "blue", uiScale: 1, sidebarCollapsed: false, lastBookId: null, updatedAt: 0, ...patch };
}

function reviewedSrs(lastReview: number): Entry["srs"] {
  return { ...newSrs(lastReview), reps: 3, lastReview, due: lastReview };
}

/** 同一本书在三台设备上的副本（确定性 id 与时间戳，专防「显式重置」语义误判） */
function mkBook(): Wordbook {
  return {
    ...createEmptyBook("共享本"),
    id: "b1",
    createdAt: 0,
    updatedAt: T,
    entries: [
      makeEntry({ id: "e-1", headword: "abandon", createdAt: 0, updatedAt: 0 }),
      makeEntry({ id: "e-2", headword: "ability", createdAt: 0, updatedAt: 0 }),
    ],
  };
}

function mkDevice(
  id: string,
  accent: AppSettings["accent"],
  opts: { reviewEntry?: string; reviewAt?: number } = {},
): Device {
  const book = mkBook();
  if (opts.reviewEntry) {
    const at = opts.reviewAt ?? T;
    const e = book.entries.find((x) => x.id === opts.reviewEntry)!;
    e.srs = reviewedSrs(at);
    e.status = "learning";
    e.updatedAt = at;
  }
  return {
    id,
    state: {
      books: [book],
      settings: mkSettings({ accent, updatedAt: accent === "blue" ? 0 : T }),
      lookupSources: [],
      dictionaries: [],
    },
    base: null,
    lastPushHash: null,
  };
}

function payloadOf(dev: Device): SyncPayloadV1 {
  return buildSyncPayload(dev.state, { mode: "snapshot", deviceId: dev.id, tombstones: [] });
}

/** 一轮同步：拉 → 合并 → 推（与 engine.ts 同语义；返回 gist 上最新的信封） */
function sync(dev: Device, gist: Gist | null): Gist | null {
  let next = gist;
  if (gist && gist.deviceId !== dev.id) {
    const remote = JSON.parse(gist.text) as SyncPayloadV1;
    const res = mergeSync({
      local: dev.state,
      remote,
      meta: {
        base: dev.base,
        lastSyncAt: null,
        localDeviceId: dev.id,
        remoteDeviceId: remote.deviceId,
        tombstones: [],
        now: 0,
      },
    });
    dev.state = res.state;
    dev.base = res.nextBase;
  }
  const payload = payloadOf(dev);
  const hash = quickHash(payload);
  if (hash !== dev.lastPushHash) {
    dev.lastPushHash = hash;
    next = { text: stableJson(payload), deviceId: dev.id, revision: (gist?.revision ?? 0) + 1 };
  }
  return next;
}

describe("三端仿真（引擎语义：拉 → 合并 → 推）", () => {
  it("主题色（琥珀）+ 学习进度：若干轮后三端全部对齐", () => {
    const phone = mkDevice("phone", "amber", { reviewEntry: "e-1", reviewAt: T });
    const laptop = mkDevice("laptop", "blue", { reviewEntry: "e-2", reviewAt: T + 1000 });
    const desktop = mkDevice("desktop", "blue"); // 什么都没做过

    let gist: Gist | null = null;
    for (let c = 0; c < 4; c += 1) {
      gist = sync(phone, gist);
      gist = sync(laptop, gist);
      gist = sync(desktop, gist);
    }

    for (const dev of [phone, laptop, desktop]) {
      const entries = new Map(dev.state.books[0].entries.map((e) => [e.id, e]));
      expect(entries.get("e-1")?.srs, `${dev.id} 应拿到手机的复习记录`).toBeTruthy();
      expect(entries.get("e-2")?.srs, `${dev.id} 应拿到笔记本的复习记录`).toBeTruthy();
      expect(dev.state.settings.accent, `${dev.id} 应拿到琥珀主题`).toBe("amber");
    }
  });

  it("旧远端不覆盖新本地设置（updatedAt 较新者胜），随后其余设备跟随", () => {
    // Gist 上躺的是笔记本较早推送的信封（蓝色、updatedAt=0）
    const laptopOld = mkDevice("laptop", "blue");
    laptopOld.lastPushHash = "seeded";
    const gist: Gist = { text: stableJson(payloadOf(laptopOld)), deviceId: "laptop", revision: 1 };

    const phone = mkDevice("phone", "amber");
    const g1 = sync(phone, gist);
    expect(g1).toBeTruthy();
    expect(phone.state.settings.accent, "手机不应被旧蓝色覆盖").toBe("amber");

    const laptop = mkDevice("laptop", "blue");
    sync(laptop, g1);
    expect(laptop.state.settings.accent, "笔记本应跟随手机的琥珀").toBe("amber");
  });

  it("双方都是旧数据（均无时间戳）时按设备号确定性裁决——双方收敛到同一侧", () => {
    const mkLegacy = (id: string, accent: AppSettings["accent"]) => {
      const dev = mkDevice(id, accent);
      dev.state.settings.updatedAt = 0; // 升级前的旧数据：没有时间戳
      return dev;
    };
    const phone = mkLegacy("phone", "amber");
    const laptop = mkLegacy("laptop", "blue");
    let g: Gist | null = sync(phone, null);
    g = sync(laptop, g);
    sync(phone, g);
    expect(phone.state.settings.accent).toBe(laptop.state.settings.accent);
    expect(phone.state.settings.accent).toBe("amber"); // "phone" > "laptop"：设备号较大者胜
  });
});
