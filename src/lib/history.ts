import { create } from "zustand";
import type { StateCreator } from "zustand";

/**
 * 全局撤销/重做 · 历史中间件
 * ------------------------------------------------------------
 * - 结构共享快照：zustand 的不可变更新使快照只是「引用组」，几乎零内存开销；
 * - 合并窗口：同一处连续修改（如逐键输入）在 coalesceMs 内合并为一步（按签名判定）；
 * - 抑制开关：评分/同步合并/整库导入等不应进入历史，动作内用 suppress() 包裹；
 * - 恢复后墓碑对齐：undo/redo 通过 onRestore(restored, replaced) 由 store 侧对齐 IDB 墓碑；
 * - 状态经独立小 store 暴露（canUndo/canRedo），供 UI 与命令面板订阅。
 */

export interface HistoryMeta {
  canUndo: boolean;
  canRedo: boolean;
  depth: number;
}

export const useHistoryStore = create<HistoryMeta>(() => ({ canUndo: false, canRedo: false, depth: 0 }));

type Snapshot = Record<string, unknown>;

export interface HistoryApi {
  undo: () => void;
  redo: () => void;
  /** 清空历史（整库导入/清空数据后调用） */
  clear: () => void;
  /** 暂停记录：返回结束函数（可嵌套） */
  suppress: () => () => void;
}

export interface HistoryCfg {
  /** 参与历史的状态键（其余键的变化不进历史） */
  keys: string[];
  /** 历史深度上限 */
  limit?: number;
  /** 同签名变更在窗口内合并为一步（ms）；0 = 不合并 */
  coalesceMs?: number;
  /** 变更签名（相同签名视为「同一处连续修改」） */
  signature?: (before: Snapshot, after: Snapshot, keys: string[]) => string;
  /** 恢复后回调（墓碑对齐等异步副作用；store 侧接 IDB） */
  onRestore?: (restored: Snapshot, replaced: Snapshot) => void | Promise<void>;
}

/** 默认签名：能定位到「某一本书 / 某一条词」时给精细签名，便于输入合并；否则按键集合 */
export function defaultSignature(before: Snapshot, after: Snapshot, keys: string[]): string {
  const changed = keys.filter((k) => before[k] !== after[k]);
  if (!changed.length) return "";
  if (changed.length === 1 && changed[0] === "books") {
    const b = (before.books ?? []) as Array<{ id: string; entries: Array<{ id: string }> }>;
    const a = (after.books ?? []) as Array<{ id: string; entries: Array<{ id: string }> }>;
    if (b.length === a.length) {
      let idx = -1;
      let count = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
          count += 1;
          idx = i;
        }
      }
      if (count === 1) {
        const be = b[idx];
        const ae = a[idx];
        if (be.entries.length === ae.entries.length) {
          let eIdx = -1;
          let eCount = 0;
          for (let j = 0; j < ae.entries.length; j += 1) {
            if (ae.entries[j] !== be.entries[j]) {
              eCount += 1;
              eIdx = j;
            }
          }
          if (eCount === 1) return `books:${ae.id}:${ae.entries[eIdx].id}`;
        }
        return `books:${ae.id}`;
      }
    }
  }
  return changed.slice().sort().join(",");
}

export function withHistory<S extends object>(init: StateCreator<S, [], [], S>, cfg: HistoryCfg): StateCreator<S, [], [], S> {
  return (set, get, api) => {
    const keys = cfg.keys;
    const limit = cfg.limit ?? 40;
    const coalesceMs = cfg.coalesceMs ?? 500;
    const signature = cfg.signature ?? defaultSignature;

    let past: Snapshot[] = [];
    let future: Snapshot[] = [];
    let lastAt = 0;
    let lastSig = "";
    let suppressDepth = 0;

    const snap = (): Snapshot => {
      const s = get() as Record<string, unknown>;
      const o: Snapshot = {};
      for (const k of keys) o[k] = s[k];
      return o;
    };
    const syncMeta = () => {
      useHistoryStore.setState({ canUndo: past.length > 0, canRedo: future.length > 0, depth: past.length });
    };

    const wrappedSet = ((partial: unknown, replace?: boolean) => {
      const before = snap();
      (set as (p: unknown, r?: boolean) => void)(partial, replace);
      if (suppressDepth > 0) return;
      const after = snap();
      if (keys.every((k) => before[k] === after[k])) return;
      const now = Date.now();
      const sig = signature(before, after, keys);
      const merge = past.length > 0 && coalesceMs > 0 && sig !== "" && sig === lastSig && now - lastAt <= coalesceMs;
      if (!merge) {
        past.push(before);
        if (past.length > limit) past.shift();
      }
      lastAt = now;
      lastSig = sig;
      future = [];
      syncMeta();
    }) as typeof set;

    const apply = (restored: Snapshot, replaced: Snapshot) => {
      (set as (p: unknown, r?: boolean) => void)(restored, false);
      syncMeta();
      void cfg.onRestore?.(restored, replaced);
    };

    const undo = () => {
      if (!past.length) return;
      const current = snap();
      const prev = past.pop() as Snapshot;
      future.push(current);
      lastSig = ""; // 撤销后不与后续修改合并
      apply(prev, current);
    };
    const redo = () => {
      if (!future.length) return;
      const current = snap();
      const next = future.pop() as Snapshot;
      past.push(current);
      lastSig = "";
      apply(next, current);
    };
    const clear = () => {
      past = [];
      future = [];
      lastSig = "";
      syncMeta();
    };
    const suppress = () => {
      suppressDepth += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        suppressDepth = Math.max(0, suppressDepth - 1);
      };
    };

    (api as unknown as { __wvHistory?: HistoryApi }).__wvHistory = { undo, redo, clear, suppress };
    return init(wrappedSet, get, api);
  };
}

/** 从 zustand api 取历史控制器（store 动作内使用；未装配时为 undefined） */
export function historyOf(api: unknown): HistoryApi | undefined {
  return (api as { __wvHistory?: HistoryApi }).__wvHistory;
}
