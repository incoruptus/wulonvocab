import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { defaultSignature, useHistoryStore, withHistory } from "./history";

interface MiniState {
  a: number;
  b: string;
  nested: { id: string; entries: { id: string }[] }[];
  inc: () => void;
  setB: (v: string) => void;
  setNested: (entryId: string, patch: { v: number }) => void;
}

function mkMini() {
  return create<MiniState>()(
    withHistory(
      (set) => ({
        a: 0,
        b: "",
        nested: [{ id: "bk1", entries: [{ id: "e1" }, { id: "e2" }] }],
        inc: () => set((s) => ({ a: s.a + 1 })),
        setB: (v) => set({ b: v }),
        setNested: (entryId, patch) =>
          set((s) => ({
            nested: s.nested.map((bk) => ({
              ...bk,
              entries: bk.entries.map((e) => (e.id === entryId ? ({ ...e, ...patch } as unknown as { id: string }) : e)),
            })),
          })),
      }),
      {
        keys: ["a", "b", "nested"],
        limit: 3,
        coalesceMs: 0,
      },
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
  useHistoryStore.setState({ canUndo: false, canRedo: false, depth: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("withHistory 基础", () => {
  it("push / undo / redo / 新修改清空重做", () => {
    const store = mkMini();
    const api = (store as unknown as { __wvHistory?: unknown }).__wvHistory;
    expect(api).toBeTruthy();
    const h = (store as unknown as { __wvHistory: { undo: () => void; redo: () => void } }).__wvHistory;

    store.getState().inc();
    store.getState().inc();
    expect(store.getState().a).toBe(2);
    expect(useHistoryStore.getState().canUndo).toBe(true);

    h.undo();
    expect(store.getState().a).toBe(1);
    h.undo();
    expect(store.getState().a).toBe(0);
    h.undo();
    expect(store.getState().a).toBe(0); // 空栈无操作

    h.redo();
    expect(store.getState().a).toBe(1);
    store.getState().inc(); // 新修改 → 清空 future
    expect(useHistoryStore.getState().canRedo).toBe(false);
    expect(store.getState().a).toBe(2);
  });

  it("深度上限：只保留最近 limit 步", () => {
    const store = mkMini();
    const h = (store as unknown as { __wvHistory: { undo: () => void } }).__wvHistory;
    for (let i = 0; i < 5; i += 1) store.getState().inc();
    expect(store.getState().a).toBe(5);
    h.undo();
    h.undo();
    h.undo();
    expect(store.getState().a).toBe(2); // 只能退 3 步
  });
});

describe("合并窗口与签名", () => {
  it("同签名窗口内合并为一步；超窗后独立成步", () => {
    const store = create<MiniState>()(
      withHistory(
        (set) => ({
          a: 0,
          b: "",
          nested: [{ id: "bk1", entries: [{ id: "e1" }] }],
          inc: () => set((s) => ({ a: s.a + 1 })),
          setB: (v) => set({ b: v }),
          setNested: (entryId, patch) =>
            set((s) => ({ nested: s.nested.map((bk) => ({ ...bk, entries: bk.entries.map((e) => (e.id === entryId ? ({ ...e, ...patch } as unknown as { id: string }) : e)) })) })),
        }),
        { keys: ["a", "b", "nested"], coalesceMs: 600 },
      ),
    );
    const h = (store as unknown as { __wvHistory: { undo: () => void } }).__wvHistory;

    // 逐键输入（同一条词）→ 合并
    vi.advanceTimersByTime(10);
    store.getState().setNested("e1", { v: 1 });
    vi.advanceTimersByTime(100);
    store.getState().setNested("e1", { v: 2 });
    vi.advanceTimersByTime(100);
    store.getState().setNested("e1", { v: 3 });
    h.undo();
    expect((store.getState().nested[0].entries[0] as unknown as { v: number }).v ?? undefined).toBeUndefined();

    // 超过窗口 → 独立成步
    vi.advanceTimersByTime(1000);
    store.getState().setB("x");
    vi.advanceTimersByTime(1000);
    store.getState().setB("y");
    h.undo();
    expect(store.getState().b).toBe("x");
    h.undo();
    expect(store.getState().b).toBe("");
  });

  it("不同签名的快速连改不合并（书级变化 vs 另一处）", () => {
    const store = mkMini();
    const h = (store as unknown as { __wvHistory: { undo: () => void } }).__wvHistory;
    vi.advanceTimersByTime(10);
    store.getState().setNested("e1", { v: 1 });
    vi.advanceTimersByTime(10);
    store.getState().setNested("e2", { v: 1 });
    h.undo();
    expect((store.getState().nested[0].entries[1] as unknown as { v: number }).v ?? undefined).toBeUndefined();
    expect((store.getState().nested[0].entries[0] as unknown as { v: number }).v).toBe(1);
  });
});

describe("抑制与签名工具", () => {
  it("suppress 期间的修改不进历史；结束后恢复记录", () => {
    const store = create<MiniState>()(
      withHistory(
        (set, get, api) => ({
          a: 0,
          b: "",
          nested: [],
          inc: () => {
            const end = (api as unknown as { __wvHistory: { suppress: () => () => void } }).__wvHistory.suppress();
            try {
              set((s) => ({ a: s.a + 1 }));
            } finally {
              end();
            }
          },
          setB: (v) => set({ b: v }),
          setNested: (entryId, patch) =>
            set((s) => ({ nested: s.nested.map((bk) => ({ ...bk, entries: bk.entries.map((e) => (e.id === entryId ? ({ ...e, ...patch } as unknown as { id: string }) : e)) })) })),
        }),
        { keys: ["a", "b", "nested"], coalesceMs: 0 },
      ),
    );
    const h = (store as unknown as { __wvHistory: { undo: () => void } }).__wvHistory;
    store.getState().inc();
    expect(useHistoryStore.getState().canUndo).toBe(false);
    store.getState().setB("k");
    h.undo();
    expect(store.getState().b).toBe("");
    expect(store.getState().a).toBe(1); // 被抑制的修改不被撤销
  });

  it("defaultSignature：定位到具体词条；多本书变化退化为键集合", () => {
    const e1 = { id: "e1" };
    const e2 = { id: "e2" };
    const before = { books: [{ id: "b1", entries: [e1, e2] }] };
    const after = { books: [{ id: "b1", entries: [e1, { ...e2 }] }] };
    expect(defaultSignature(before, after, ["books"])).toBe("books:b1:e2");

    const after2 = { books: [{ id: "b1", entries: [e1] }] };
    expect(defaultSignature(before, after2, ["books"])).toBe("books:b1");
  });
});
