/**
 * 自动同步协调器
 * ------------------------------------------------------------
 * - UI（GistSyncBlock）挂载时注册 store 依赖；本地重要写入（会话结束 / 批量导入 / 手动合并）后
 *   调 `requestSyncSoon()`，默认 30s 防抖后跑一轮（R5 研究 §2.4 的节奏建议）；
 * - 同步开关关闭、未配置或处于失败退避中时静默跳过；
 * - 不 import store：依赖由 UI 注入（AGENTS #12），引擎负责状态广播与退避记录。
 */

import { toast } from "sonner";
import { runGistSync, type SyncDeps } from "./engine";
import { loadSyncMeta } from "./meta";

let deps: SyncDeps | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastImmediateNoticeAt = 0;

export function registerSyncDeps(d: SyncDeps): () => void {
  deps = d;
  return () => {
    if (deps === d) deps = null;
  };
}

/** 会话结束 / 批量导入后调用：30s 防抖合并多次写入，只推一轮 */
export function requestSyncSoon(delayMs = 30_000): void {
  if (!deps) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runDeferredPush();
  }, delayMs);
}

async function runDeferredPush(): Promise<void> {
  const d = deps;
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
 * 设置类变更：立即推送（不等防抖，合并单飞队列）。
 * 与「已生效」确认配合：成功 → 轻提示「已同步到云端」；失败 → 说明仍在本机生效并会自动重试。
 * 未配置自动同步 / 处于失败退避时静默跳过（不打扰纯本地用户）。
 */
export function requestSyncNow(): void {
  const d = deps;
  if (!d) return;
  void (async () => {
    try {
      const meta = await loadSyncMeta();
      const gist = meta.gist;
      if (!gist?.enabled || !gist.token || !gist.pairCode) return;
      if (gist.backoffUntil && Date.now() < gist.backoffUntil) return;
      await runGistSync(d);
      if (Date.now() - lastImmediateNoticeAt > 1600) {
        lastImmediateNoticeAt = Date.now();
        toast.success("设置已同步到云端");
      }
    } catch (e) {
      if (Date.now() - lastImmediateNoticeAt > 1600) {
        lastImmediateNoticeAt = Date.now();
        toast.error(`设置已在本机生效；云端同步失败：${(e as Error).message}`, {
          description: "连接恢复后会自动重试；期间其他设备的设置可能暂时不一致",
        });
      }
    }
  })();
}
