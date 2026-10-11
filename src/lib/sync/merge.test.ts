import { describe, expect, it } from "vitest";
import type { Entry, Wordbook } from "../types";
import { createEmptyBook } from "../presets";
import { stableJson } from "./pack";
import { computeBaseHashes, mergeSync } from "./merge";
import type { MergeInput, SyncPayloadV1, SyncState, SyncTombstone } from "./types";

/* ---------------- fixtures ---------------- */

function mkBook(id: string, updatedAt: number, entries: Entry[] = []): Wordbook {
  const base = createEmptyBook(`书-${id}`);
  return { ...base, id, updatedAt, createdAt: 0, entries };
}

function mkEntry(id: string, updatedAt: number, patch: Partial<Entry> = {}): Entry {
  return {
    id,
    headword: `w-${id}`,
    tags: [],
    status: "new",
    starred: false,
    createdAt: updatedAt,
    updatedAt,
    values: {
      senses: [
        {
          id: `s-${id}`,
          pos: "n.",
          translation: `释义-${id}`,
          definition: "",
          examples: [],
          usage: "",
          patterns: [],
          synonyms: [],
          antonyms: [],
          collocations: [],
          notes: "",
        },
      ],
    },
    ...patch,
  };
}

function mkPayload(deviceId: string, books: Wordbook[]): SyncPayloadV1 {
  return {
    mode: "snapshot",
    since: null,
    deviceId,
    books: books.map((b) => {
      const { entries, ...rest } = b;
      return { book: rest, entries };
    }),
    tombstones: [],
    stats: { books: books.length, entries: books.reduce((n, b) => n + b.entries.length, 0) },
  };
}

function mkState(books: Wordbook[]): SyncState {
  return {
    books,
    settings: { theme: "light", accent: "blue", uiScale: 1, sidebarCollapsed: false, lastBookId: "local-book" },
    lookupSources: [],
    dictionaries: [],
  };
}

function mkInput(
  local: SyncState,
  remoteBooks: Wordbook[],
  opts: Partial<MergeInput["meta"]> = {},
): MergeInput {
  return {
    local,
    remote: mkPayload("devB", remoteBooks),
    meta: {
      base: null,
      lastSyncAt: null,
      localDeviceId: "devA",
      remoteDeviceId: "devB",
      tombstones: [],
      ...opts,
    },
  };
}

const tomb = (t: Partial<SyncTombstone> & { kind: SyncTombstone["kind"]; id: string }): SyncTombstone => ({
  deletedAt: 0,
  deviceId: "devA",
  ...t,
});

/* ---------------- tests ---------------- */

describe("mergeSync · 存在性与墓碑", () => {
  it("不相交两本书 → 并集", () => {
    const r = mergeSync(mkInput(mkState([mkBook("b1", 10)]), [mkBook("b2", 20)]));
    expect(r.state.books.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(r.applied.booksAdded).toBe(1);
  });

  it("同书各加不同词条 → 并集（本地顺序保留、远端新增按 createdAt 降序追加）", () => {
    const local = mkState([mkBook("b1", 100, [mkEntry("e1", 10), mkEntry("e3", 30)])]);
    const remote = [mkBook("b1", 100, [mkEntry("e2", 20), mkEntry("e4", 40)])];
    const r1 = mergeSync(mkInput(local, remote));
    const ids = r1.state.books[0].entries.map((e) => e.id);
    expect(ids).toEqual(["e1", "e3", "e4", "e2"]);
  });

  it("书墓碑晚于存活 → 删除胜（含级联词条计数）", () => {
    const remote = mkBook("b1", 50, [mkEntry("e1", 50), mkEntry("e2", 50)]);
    const r = mergeSync(
      mkInput(mkState([]), [remote], { tombstones: [tomb({ kind: "book", id: "b1", deletedAt: 60 })] }),
    );
    expect(r.state.books).toHaveLength(0);
    expect(r.applied.booksDeleted).toBe(1);
    expect(r.applied.entriesDeleted).toBe(2);
  });

  it("编辑晚于墓碑 → 存活（时间线语义）", () => {
    const remote = mkBook("b1", 80, [mkEntry("e1", 80)]);
    const r = mergeSync(
      mkInput(mkState([]), [remote], { tombstones: [tomb({ kind: "book", id: "b1", deletedAt: 60 })] }),
    );
    expect(r.state.books).toHaveLength(1);
  });

  it("条目墓碑屏蔽远端条目，且二次合并幂等", () => {
    const local = mkState([mkBook("b1", 100)]);
    const remote = mkBook("b1", 100, [mkEntry("e1", 90)]);
    const t = [tomb({ kind: "entry", id: "e1", bookId: "b1", deletedAt: 95 })];
    const r1 = mergeSync(mkInput(local, [remote], { tombstones: t }));
    expect(r1.state.books[0].entries).toHaveLength(0);
    const second = mergeSync({
      ...mkInput(mkState(r1.state.books), [remote], { tombstones: r1.nextTombstones }),
    });
    expect(second.state.books[0].entries).toHaveLength(0);
    expect(second.applied.entriesDeleted).toBe(1);
  });
});

describe("mergeSync · LWW 与冲突", () => {
  it("同词条双改：晚者胜；平局 deviceId 大者胜（两端结果一致）", () => {
    const closer = (localDev: string, remoteDev: string, la: number, ra: number) => {
      const local = mkState([mkBook("b1", 100, [mkEntry("e1", la, { starred: true })])]);
      const remote = mkBook("b1", 100, [mkEntry("e1", ra, { starred: false })]);
      const r = mergeSync({
        ...mkInput(local, [remote]),
        meta: { ...mkInput(local, [remote]).meta, localDeviceId: localDev, remoteDeviceId: remoteDev },
      });
      return r.state.books[0].entries[0].starred;
    };
    expect(closer("devA", "devB", 200, 100)).toBe(true); // local 晚
    expect(closer("devA", "devB", 100, 200)).toBe(false); // remote 晚
    expect(closer("devA", "devB", 100, 100)).toBe(false); // 平局：devB 大 → remote 胜
    expect(closer("devB", "devA", 100, 100)).toBe(true); // 视角互换：local 即 devB，仍由 devB 胜
  });

  it("base 单边改 → 取改方，无冲突", () => {
    const lb = mkBook("b1", 100);
    const local = mkState([lb]);
    const base = computeBaseHashes(local);
    const remoteB = { ...lb, name: "远端改名", updatedAt: 150 };
    const r = mergeSync(mkInput(local, [remoteB], { base, lastSyncAt: 90 }));
    expect(r.state.books[0].name).toBe("远端改名");
    expect(r.conflicts).toHaveLength(0);
  });

  it("双改 → 冲突默认 remote，resolutions 可翻回 local", () => {
    const lb = mkBook("b1", 100);
    const local = mkState([lb]);
    const base = computeBaseHashes(local);
    const remoteB = { ...lb, name: "远端改名", updatedAt: 150 };
    const localB = { ...lb, name: "本地改名", updatedAt: 140 };
    const input = mkInput(mkState([localB]), [remoteB], { base, lastSyncAt: 90 });
    const r1 = mergeSync(input);
    const key = "book:b1:meta";
    expect(r1.conflicts.map((c) => c.entityKey)).toContain(key);
    expect(r1.state.books[0].name).toBe("远端改名");
    const r2 = mergeSync({ ...input, resolutions: { [key]: "local" } });
    expect(r2.state.books[0].name).toBe("本地改名");
    const flipped = r2.conflicts.find((c) => c.entityKey === key);
    expect(flipped?.chosen).toBe("local");
    expect(flipped?.canFlip).toBe(false); // 已人工裁决
  });

  it("冲突列表按 entityKey 排序且两组输入对称", () => {
    const lb = mkBook("b1", 100);
    const local = mkState([lb]);
    const base = computeBaseHashes(local);
    const remoteB = { ...lb, name: "远端改名", updatedAt: 150 };
    const localB = { ...lb, name: "本地改名", updatedAt: 140 };
    const r1 = mergeSync(mkInput(mkState([localB]), [remoteB], { base, lastSyncAt: 90 }));
    const r2 = mergeSync({
      local: mkState([localB]),
      remote: mkPayload("devA", [remoteB]),
      meta: { base, lastSyncAt: 90, localDeviceId: "devB", remoteDeviceId: "devA", tombstones: [] },
    });
    const keys1 = r1.conflicts.map((c) => c.entityKey);
    expect(keys1).toEqual([...keys1].sort());
    expect(r2.conflicts.map((c) => c.entityKey)).toEqual(keys1);
    expect(stableJson(r1.state)).toBe(stableJson(r2.state));
  });
});

describe("mergeSync · SRS / 日志", () => {
  it("仅一端有复习记录 → 保留该端", () => {
    const srs = { due: 9, lastReview: 50, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 9, reps: 3, lapses: 0, state: 2, learningSteps: 0 };
    const local = mkState([mkBook("b1", 100, [mkEntry("e1", 100, { srs })])]);
    const remote = mkBook("b1", 100, [mkEntry("e1", 60)]);
    const r = mergeSync(mkInput(local, [remote], { lastSyncAt: 50 }));
    expect(r.state.books[0].entries[0].srs?.reps).toBe(3);
  });

  it("双端都有：lastReview 晚者胜，status 随之推导", () => {
    const mk = (last: number, reps: number, state = 2, days = 25) => ({
      due: last + 1000,
      lastReview: last,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: days,
      reps,
      lapses: 0,
      state,
      learningSteps: 0,
    });
    const local = mkState([mkBook("b1", 100, [mkEntry("e1", 100, { srs: mk(90, 3) })])]);
    const remote = mkBook("b1", 100, [mkEntry("e1", 100, { srs: mk(95, 4) })]);
    const r = mergeSync(mkInput(local, [remote], { lastSyncAt: 90 }));
    expect(r.state.books[0].entries[0].srs?.reps).toBe(4);
    expect(r.state.books[0].entries[0].status).toBe("mastered"); // Review 且 ≥21 天
  });

  it("显式重置尊重：无 srs 且晚于对方 lastReview 的编辑不被复活", () => {
    const srs = { due: 9, lastReview: 50, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 9, reps: 3, lapses: 0, state: 2, learningSteps: 0 };
    const local = mkState([mkBook("b1", 100, [mkEntry("e1", 200, { srs: undefined })])]); // 本地重置且晚编辑
    const remote = mkBook("b1", 100, [mkEntry("e1", 80, { srs })]);
    const r = mergeSync(mkInput(local, [remote]));
    expect(r.state.books[0].entries[0].srs).toBeUndefined();
  });

  it("daily 按日逐计数器 max，且合并幂等", () => {
    const logA = { added: 1, reviewed: 3, again: 0, hard: 1, good: 2, easy: 0, ms: 600 };
    const logB = { added: 2, reviewed: 2, again: 1, hard: 0, good: 1, easy: 0, ms: 500 };
    const mkB = (daily: Record<string, typeof logA>) => {
      const b = mkBook("b1", 100);
      return { ...b, study: { config: (b as Wordbook).study?.config ?? null, daily } } as unknown as Wordbook;
    };
    const local = mkState([mkB({ "2026-01-01": logA })]);
    const remote = mkB({ "2026-01-01": logB, "2026-01-02": { ...logA, reviewed: 5 } });
    const r1 = mergeSync(mkInput(local, [remote]));
    const d = r1.state.books[0].study?.daily["2026-01-01"];
    expect(d).toMatchObject({ added: 2, reviewed: 3, again: 1, hard: 1, good: 2, ms: 600 });
    expect(r1.state.books[0].study?.daily["2026-01-02"]?.reviewed).toBe(5);
    const r2 = mergeSync(mkInput(mkState(r1.state.books), [remote]));
    expect(stableJson(r2.state.books[0].study?.daily)).toBe(stableJson(r1.state.books[0].study?.daily));
  });
});

describe("mergeSync · 设置与收敛", () => {
  it("settings 单边改取改方；lastBookId 永远保持 local", () => {
    const local = mkState([]);
    const base = computeBaseHashes(local);
    const remoteBooks: Wordbook[] = [];
    const input = mkInput(local, remoteBooks, { base, lastSyncAt: 1 });
    input.remote.settings = { theme: "dark", accent: "blue", uiScale: 1, sidebarCollapsed: false };
    const r = mergeSync(input);
    expect(r.state.settings.theme).toBe("dark");
    expect(r.state.settings.lastBookId).toBe("local-book");
    expect(r.conflicts).toHaveLength(0);
  });

  it("无变化合并不产生 added/updated", () => {
    const b = mkBook("b1", 100, [mkEntry("e1", 50)]);
    const local = mkState([b]);
    const base = computeBaseHashes(local);
    const r = mergeSync(mkInput(local, [b], { base, lastSyncAt: 100 }));
    expect(r.applied).toEqual({ booksAdded: 0, booksUpdated: 0, booksDeleted: 0, entriesAdded: 0, entriesUpdated: 0, entriesDeleted: 0 });
  });

  it("三端收敛：A→B→C→A 后三方状态一致", () => {
    const baseA = mkState([mkBook("b1", 100, [mkEntry("e1", 10)])]);
    const baseHashes = computeBaseHashes(baseA);
    const B = mkState([mkBook("b1", 100, [mkEntry("e1", 10), mkEntry("e2", 20)])]);
    const C = mkState([mkBook("b1", 100, [mkEntry("e1", 10), mkEntry("e3", 30)])]);
    const rAB = mergeSync(mkInput(baseA, B.books, { base: baseHashes, lastSyncAt: 0 }));
    const rABC = mergeSync(mkInput(rAB.state, C.books, { base: rAB.nextBase, lastSyncAt: 0 }));
    // C 再向 A 同步一次：状态不再变化
    const rABCA = mergeSync({
      local: rABC.state,
      remote: mkPayload("devC", B.books),
      meta: { base: rABC.nextBase, lastSyncAt: 0, localDeviceId: "devA", remoteDeviceId: "devB", tombstones: [] },
    });
    expect(rABCA.state.books[0].entries.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
    expect(rABCA.applied.entriesAdded).toBe(0);
  });
});
