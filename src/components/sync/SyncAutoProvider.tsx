"use client";

import { useEffect } from "react";
import { loadSyncMeta } from "@/lib/sync/meta";
import { runGistSync } from "@/lib/sync/engine";
import { registerSyncDeps } from "@/lib/sync/auto";
import { syncDeps } from "@/components/sync/syncDeps";

const VISIBLE_PULL_GAP_MS = 10 * 60 * 1000;

let lastAutoAt = 0;

/**
 * 全局自动同步调度（挂根布局，所有页面常驻）
 * ------------------------------------------------------------
 * 启动 +5s / 切回前台（距上次 ≥10min）/ 恢复联网 / 常驻每 30min 各 tick 一次。
 * 每次 tick 重新读 meta：开关、配置、退避状态变化即时生效。
 *
 * 背景（三端实测缺陷）：这些触发器原先挂在「设置页的同步卡片」里——用户不打开设置页，
 * 自动同步就永远不会发生（主题色/学习进度不传播即此因）。调度必须全局常驻。
 */
export function SyncAutoProvider() {
  useEffect(() => {
    const unregister = registerSyncDeps(syncDeps);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const meta = await loadSyncMeta();
        const gist = meta.gist;
        if (!gist?.enabled || !gist.token || !gist.pairCode) return;
        if (gist.backoffUntil && Date.now() < gist.backoffUntil) return;
        lastAutoAt = Date.now();
        await runGistSync(syncDeps);
      } catch {
        /* 引擎已广播错误状态并记录退避 */
      }
    };

    const boot = setTimeout(() => void tick(), 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAutoAt > VISIBLE_PULL_GAP_MS) void tick();
    };
    const onOnline = () => void tick();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearTimeout(boot);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      unregister();
    };
  }, []);

  return null;
}
