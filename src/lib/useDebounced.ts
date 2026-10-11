import { useEffect, useState } from "react";

/**
 * 值防抖：滑杆/输入等高频变更只让「稳定后的值」触发重计算。
 * 返回 { value: 稳定值, pending: 是否仍在等待稳定 }（pending 供 UI 显示「正在更新…」）。
 */
export function useDebouncedValue<T>(value: T, delayMs = 180): { value: T; pending: boolean } {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, settled, delayMs]);
  return { value: settled, pending: value !== settled };
}
