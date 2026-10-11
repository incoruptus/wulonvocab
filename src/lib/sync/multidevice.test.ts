import { describe, expect, it } from "vitest";
import type { AppSettings, Entry, Wordbook } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { newSrs } from "../study/engine";
import { buildSyncPayload, quickHash, stableJson } from "./pack";
import { mergeSync } from "./merge";
import { pairIdOf } from "./crypto";
import type { BaseHashes, SyncPayloadV1, SyncState } from "./types";

/**
 * 三端仿真（World 模型：每台设备有独立的 gistId，「Gist 账号」是共享注册表）。
 * 精确复刻 engine.ts 每轮行为：发现中转站（gistFind）→ 拉 → 三方合并（base 演进）→ 推（指纹相同跳过）。
 *
 * 历史缺陷（此模型可捕获）：初版各端首同步直接 POST 新建自己的 Gist、gistId 从不共享——
 * 每台设备都在和自己的私有中转站对话，配对码相同也永远不会相遇（手动同步也「没有生效」）。
 */

const T = 1_000_000;
const PAIR = "AAAA-BBBB-CCCC-DDDD-EEEE";
const TAG = pairIdOf(PAIR);

interface WorldGist {
  id: string;
  description: string;
  deviceId: string;
  text: string;
  updatedAt: number;
}

interface World {
  gists: Map<string, WorldGist>;
  clock: number;
  nextId: number;
}

interface Device {
  id: string;
  state: SyncState;
  base: BaseHashes | null;
  lastPushHash: string | null;
  gistId: string | null;
}

function mkWorld(): World {
  return { gists: new Map(), clock: 0, nextId: 1 };
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
  uiScale: number,
  opts: { reviewEntry?: string; reviewAt?: number; noBooks?: boolean } = {},
): Device {
  let books: Wordbook[] = [];
  if (!opts.noBooks) {
    const book = mkBook();
    if (opts.reviewEntry) {
      const at = opts.reviewAt ?? T;
      const e = book.entries.find((x) => x.id === opts.reviewEntry)!;
      e.srs = reviewedSrs(at);
      e.status = "learning";
      e.updatedAt = at;
    }
    books = [book];
  }
  return {
    id,
    state: {
      books,
      settings: mkSettings({ uiScale, updatedAt: uiScale === 1 ? 0 : T }),
      lookupSources: [],
      dictionaries: [],
      exportPresets: [],
    },
    base: null,
    lastPushHash: null,
    gistId: null,
  };
}

function payloadOf(dev: Device): SyncPayloadV1 {
  return buildSyncPayload(dev.state, { mode: "snapshot", deviceId: dev.id, tombstones: [] });
}

/** 发现：exact（描述带本配对标识）优先，其次更新时间新→旧（对应 transports/gist.ts 的 gistFind） */
function findCandidates(world: World): WorldGist[] {
  return [...world.gists.values()].sort((a, b) => {
    const ax = a.description.includes(TAG) ? 1 : 0;
    const bx = b.description.includes(TAG) ? 1 : 0;
    if (ax !== bx) return bx - ax;
    return b.updatedAt - a.updatedAt;
  });
}

/** 一轮同步：发现/认领 → 拉 → 合并 → 推（与 engine.ts 同语义） */
function sync(dev: Device, world: World): void {
  const candidates = findCandidates(world);
  const own = dev.gistId ? (world.gists.get(dev.gistId) ?? null) : null;
  let target = own;
  const tagged = (g: WorldGist) => g.description.includes(TAG);

  if (!target) {
    // 无本地站（新设备）或自家站已失效：认领任一候选（候选按最新优先；真实实现另有解密验证，单配对场景等价）
    for (const cand of candidates) {
      if (cand.id === dev.gistId) continue;
      target = cand;
      dev.gistId = cand.id;
      break;
    }
  } else {
    const exactBetter = candidates.find((c) => tagged(c) && c.id !== dev.gistId && c.updatedAt > target!.updatedAt);
    if (exactBetter) {
      target = exactBetter;
      dev.gistId = exactBetter.id;
    } else if (!tagged(target)) {
      // 迁移窗口：自己的站还是旧描述 → 认领首批「能解密」的他站（含同样是旧描述的站）
      for (const cand of candidates) {
        if (cand.id === dev.gistId) continue;
        target = cand;
        dev.gistId = cand.id;
        break;
      }
    }
  }

  if (target && target.deviceId !== dev.id) {
    const remote = JSON.parse(target.text) as SyncPayloadV1;
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
  if (hash !== dev.lastPushHash || !dev.gistId) {
    dev.lastPushHash = hash;
    world.clock += 1;
    if (!dev.gistId) {
      const id = `g${world.nextId}`;
      world.nextId += 1;
      world.gists.set(id, {
        id,
        description: `WulonVocab 跨端同步 · ${TAG}`,
        deviceId: dev.id,
        text: stableJson(payload),
        updatedAt: world.clock,
      });
      dev.gistId = id;
    } else {
      const g = world.gists.get(dev.gistId)!;
      g.description = `WulonVocab 跨端同步 · ${TAG}`;
      g.deviceId = dev.id;
      g.text = stableJson(payload);
      g.updatedAt = world.clock;
    }
  }
}

describe("三端仿真（World 模型：发现 → 拉 → 合并 → 推）", () => {
  it("全新配对的三台设备收敛到同一个中转站（历史缺陷回归）：设置（同步域）+ 学习进度全部对齐", () => {
    const phone = mkDevice("phone", 1.2, { reviewEntry: "e-1", reviewAt: T });
    const laptop = mkDevice("laptop", 1, { reviewEntry: "e-2", reviewAt: T + 1000 });
    const desktop = mkDevice("desktop", 1);
    const world = mkWorld();

    for (let c = 0; c < 4; c += 1) {
      sync(phone, world);
      sync(laptop, world);
      sync(desktop, world);
    }

    // 核心断言：只存在一个共享中转站（旧实现会各自建站、永不相遇）
    expect(world.gists.size).toBe(1);
    for (const dev of [phone, laptop, desktop]) {
      expect(dev.gistId, `${dev.id} 应认领同一个中转站`).toBe("g1");
      const entries = new Map(dev.state.books[0].entries.map((e) => [e.id, e]));
      expect(entries.get("e-1")?.srs, `${dev.id} 应拿到手机的复习记录`).toBeTruthy();
      expect(entries.get("e-2")?.srs, `${dev.id} 应拿到笔记本的复习记录`).toBeTruthy();
      expect(dev.state.settings.uiScale, `${dev.id} 应拿到手机的缩放设置`).toBe(1.2);
    }
  });

  it("明暗与强调色是设备本地偏好：同步只对齐同步域，各设备外观保持自己的", () => {
    const world = mkWorld();
    const phone = mkDevice("phone", 1.2, { noBooks: true });
    phone.state.settings = { ...phone.state.settings, theme: "dark", accent: "amber" };
    const laptop = mkDevice("laptop", 1, { noBooks: true });

    sync(phone, world);
    sync(laptop, world);
    sync(phone, world);
    sync(laptop, world);

    expect(laptop.state.settings.uiScale, "同步域字段应跨设备对齐").toBe(1.2);
    expect(laptop.state.settings.theme, "笔记本保留自己的明暗").toBe("light");
    expect(laptop.state.settings.accent, "笔记本保留自己的强调色").toBe("blue");
    expect(phone.state.settings.theme, "手机的暗色未被同步改动").toBe("dark");
    expect(phone.state.settings.accent).toBe("amber");
  });

  it("迁移：账号里已有旧文案的中转站（无配对标识）也会被认领——手机保住新设置并带着它回家", () => {
    const world = mkWorld();
    const legacy = mkDevice("laptop", 1, { noBooks: true });
    world.clock += 1;
    world.gists.set("g_legacy", {
      id: "g_legacy",
      description: "WulonVocab 跨端同步（密文）", // 升级前创建的旧站：描述不带配对标识
      deviceId: "laptop",
      text: stableJson(payloadOf(legacy)),
      updatedAt: world.clock,
    });

    const phone = mkDevice("phone", 1.2, { noBooks: true });
    sync(phone, world);
    expect(phone.gistId, "旧站也要认领").toBe("g_legacy");
    expect(phone.state.settings.uiScale, "手机不应被旧设置覆盖").toBe(1.2);
    expect(world.gists.get("g_legacy")!.deviceId, "推送回到了同一站（而非新建）").toBe("phone");

    const laptop = mkDevice("laptop", 1, { noBooks: true });
    sync(laptop, world);
    expect(laptop.gistId).toBe("g_legacy");
    expect(laptop.state.settings.uiScale, "笔记本应跟随手机的设置").toBe(1.2);
    expect(world.gists.size).toBe(1);
  });

  it("迁移窗口：两边各抱升级前的旧站（描述无标识）——先升级的一方认领对方旧站，数据合并收敛", () => {
    const world = mkWorld();
    const phone = mkDevice("phone", 1.2, { noBooks: true });
    const desktop = mkDevice("desktop", 1, { noBooks: true });

    // 旧版本创建的两个私有站（描述不带配对标识）
    world.clock += 1;
    world.gists.set("g_p", { id: "g_p", description: "WulonVocab 跨端同步（密文）", deviceId: "phone", text: stableJson(payloadOf(phone)), updatedAt: world.clock });
    world.clock += 1;
    world.gists.set("g_d", { id: "g_d", description: "WulonVocab 跨端同步（密文）", deviceId: "desktop", text: stableJson(payloadOf(desktop)), updatedAt: world.clock });
    phone.gistId = "g_p";
    desktop.gistId = "g_d";

    sync(phone, world); // 手机先升级：认领更新的他站（候选按更新时间排序）
    expect(phone.gistId).toBe("g_d");
    expect(phone.state.settings.uiScale, "合并后仍是手机的新设置").toBe(1.2);
    expect(world.gists.get("g_d")!.deviceId, "回推到共享站").toBe("phone");

    sync(desktop, world); // 桌面升级后：共享站已带标识 → 拉取合并
    expect(desktop.gistId).toBe("g_d");
    expect(desktop.state.settings.uiScale, "桌面应拿到手机的设置").toBe(1.2);
    expect(world.gists.get("g_p")!.deviceId, "废弃的旧站不再被使用").toBe("phone");
  });

  it("双方都是旧数据（均无时间戳）时按设备号确定性裁决——双方收敛到同一侧", () => {
    const world = mkWorld();
    const phone = mkDevice("phone", 1.2, { noBooks: true });
    const laptop = mkDevice("laptop", 1, { noBooks: true });
    phone.state.settings.updatedAt = 0;
    laptop.state.settings.updatedAt = 0;

    sync(phone, world);
    sync(laptop, world);
    sync(phone, world);
    expect(phone.state.settings.uiScale).toBe(laptop.state.settings.uiScale);
    expect(phone.state.settings.uiScale).toBe(1.2); // "phone" > "laptop"：设备号较大者胜
  });
});
