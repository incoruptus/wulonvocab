/**
 * 自动同步协调器
 * ------------------------------------------------------------
 * - 全局调度器（SyncAutoProvider）挂载时注册 store 依赖；本地重要写入（设置改动 / 学习会话 /
 *   批量导入 / 离开编辑）后调 `requestSyncNow()`（立即）或 `requestSyncSoon()`（防抖）；
 * - 同步开关关闭、未配置或处于失败退避中时静默跳过；
 * - 不 import store：依赖由 UI 注入（AGENTS #12），引擎负责状态广播与退避记录。
 *
 * 状态挂 globalThis（跨模块副本单例）
 * ------------------------------------------------------------
 * Turbopack（dev）可能对同一模块产生多个实例（实测：Provider 注册进副本 A，
 * store / 页面读副本 B → 依赖注册「丢失」，设置改动静默不推送、控件加载态失效）。
 * 注册表 / 定时器 / 提示节流一律走 globalThis，同 realm 内天然唯一。
 */

import { toast } from "sonner";
import { runGistSync, type SyncDeps } from "./engine";
import { loadSyncMeta } from "./meta";

interface AutoGlobal {
  deps: SyncDeps | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastImmediateNoticeAt: number;
  lastAutoAt: number;
}

const G = globalThis as unknown as { __wvSyncAuto?: AutoGlobal };
const state = (G.__wvSyncAuto ??= { deps: null, timer: null, lastImmediateNoticeAt: 0, lastAutoAt: 0 });

export function registerSyncDeps(d: SyncDeps): () => void {
  state.deps = d;
  return () => {
    if (state.deps === d) state.deps = null;
  };
}

/** 全局调度器读取（SyncAutoProvider 的启动/可见性节流共用同一份状态） */
export function autoSyncState(): AutoGlobal {
  return state;
}

/** 会话结束 / 批量导入后调用：默认 30s 防抖合并多次写入，只推一轮 */
export function requestSyncSoon(delayMs = 30_000): void {
  if (!state.deps) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void runDeferredPush();
  }, delayMs);
}

async function runDeferredPush(): Promise<void> {
  const d = state.deps;
  if (!d) return;
  try {
    const meta = await loadSyncMeta();
    const gist = meta.gist;
    if (!gist?.enabled || !gist.token || !gist.pairCode) return;
    if (gist.backoffUntil && Date.now() < gist.backoffUntil) return;
    await runGistSync(d);
  } catch {
    /* 引擎已广播错误状态 */
  }
}

/**
 * 设置类变更：立即推送（不等防抖，合并单飞队列），并把「云端是否已确认」交还给调用控件
 * （控件据此显示加载态并在确认前禁止再改）。
 * 返回：Promise<boolean> — true=已确认上云（或未启用自动同步，无需等待）；false=尝试失败/退避中；
 *       null=协调器尚未就绪（视同无需等待）。
 * silent=true 用于学习/编辑等场景触发：同步照跑，但不弹「设置已同步」提示。
 */
export function requestSyncNow(opts: { silent?: boolean } = {}): Promise<boolean> | null {
  const d = state.deps;
  if (!d) return null;
  return (async (): Promise<boolean> => {
    try {
      const meta = await loadSyncMeta();
      const gist = meta.gist;
      if (!gist?.enabled || !gist.token || !gist.pairCode) return true; // 未启用自动同步：无需等待
      if (gist.backoffUntil && Date.now() < gist.backoffUntil) return false;
      await runGistSync(d);
      if (!opts.silent && Date.now() - state.lastImmediateNoticeAt > 1600) {
        state.lastImmediateNoticeAt = Date.now();
        toast.success("设置已同步到云端");
      }
      return true;
    } catch (e) {
      if (!opts.silent && Date.now() - state.lastImmediateNoticeAt > 1600) {
        state.lastImmediateNoticeAt = Date.now();
        toast.error(`设置已在本机生效；云端同步失败：${(e as Error).message}`, {
          description: "连接恢复后会自动重试；期间其他设备的设置可能暂时不一致",
        });
      }
      return false;
    }
  })();
}
