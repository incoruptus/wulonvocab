"use client";

import { useCallback, useState } from "react";

/**
 * 同步确认门闩（控件用）
 * ------------------------------------------------------------
 * 提交同步域设置后保持 loading 并禁用该控件，直到云端确认（或明确失败 / 无需同步）。
 * store 的同步域动作（setSettings / setStudyConfig / 数据源增删与开关）会返回「确认 Promise」，
 * 本 hook 把它转成控件的 `pending` 状态。
 *
 * 用法：
 *   const { pending, run } = useSyncCommit();
 *   <SwitchRow loading={pending} disabled={pending}
 *     onCheckedChange={(v) => run(() => setSettings({ uiScale: v }))} />
 */
export function useSyncCommit() {
  const [pending, setPending] = useState(false);
  const run = useCallback((action: () => Promise<boolean> | null | void) => {
    const p = action();
    if (!p) return; // 纯本地改动 / 未配置自动同步：不进入加载态
    setPending(true);
    void p.finally(() => setPending(false));
  }, []);
  return { pending, run };
}
