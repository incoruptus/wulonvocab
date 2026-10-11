import { useAppStore } from "@/lib/store";
import type { SyncDeps } from "@/lib/sync/engine";

/**
 * 同步引擎的 store 接线（唯一入口，见 AGENTS #12）：
 * 引擎与协调器保持依赖注入；全局调度（SyncAutoProvider）与设置页共用这一份。
 */
export const syncDeps: SyncDeps = {
  getState: () => {
    const s = useAppStore.getState();
    return { books: s.books, settings: s.settings, lookupSources: s.lookupSources, dictionaries: s.dictionaries };
  },
  applyState: (next) => useAppStore.getState().applySyncState(next),
};
