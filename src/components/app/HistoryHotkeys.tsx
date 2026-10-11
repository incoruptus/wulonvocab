"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useHistoryStore } from "@/lib/history";

/**
 * 全局撤销/重做热键：Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 或 Ctrl+Y 重做。
 * - 跳过 Radix 等已处理的事件（defaultPrevented）；
 * - 带 [data-native-undo] 的输入（如命令面板筛选框）保留浏览器原生撤销；
 * - 其余输入不排除：本应用的输入都是受控且逐键写入 store，store 级撤销才是正确语义。
 */
export function HistoryHotkeys() {
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented) return;
      if (!(ev.metaKey || ev.ctrlKey)) return;
      const key = ev.key.toLowerCase();
      const isUndo = key === "z" && !ev.shiftKey;
      const isRedo = (key === "z" && ev.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.("[data-native-undo]")) return;
      ev.preventDefault();
      const store = useAppStore.getState();
      if (isRedo && useHistoryStore.getState().canRedo) store.redoHistory();
      else if (isUndo && useHistoryStore.getState().canUndo) store.undoHistory();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return null;
}
