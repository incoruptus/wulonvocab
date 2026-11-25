"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Word Quiz 倒计时。
 * - 只在 active 时扣时；判定后与「稳 / 猜」确认期间自动暂停。
 * - 页面隐藏时不扣除离开时间。
 * - resetKey 改变时重新开始，onTimeout 使用 ref，避免计时器因回调变化而重置。
 */
export function useChoiceTimer({
  durationMs,
  active,
  resetKey,
  onTimeout,
}: {
  durationMs: number;
  active: boolean;
  resetKey: string;
  onTimeout: () => void;
}) {
  const [clock, setClock] = useState({ durationMs, resetKey, value: durationMs });
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(durationMs);
  const lastTickRef = useRef(0);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    remainingRef.current = durationMs;
    firedRef.current = false;
    lastTickRef.current = 0;
    const raf = requestAnimationFrame(() => setClock({ durationMs, resetKey, value: durationMs }));
    return () => cancelAnimationFrame(raf);
  }, [durationMs, resetKey]);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => setPaused(document.visibilityState === "hidden"));
    lastTickRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const hidden = document.visibilityState === "hidden";
      setPaused(hidden);
      if (!hidden) {
        const delta = Math.max(0, now - lastTickRef.current);
        remainingRef.current = Math.max(0, remainingRef.current - delta);
        setClock((prev) => prev.durationMs === durationMs && prev.resetKey === resetKey
          ? { ...prev, value: remainingRef.current }
          : prev);
      }
      lastTickRef.current = now;
      if (!hidden && remainingRef.current <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeoutRef.current();
      }
    }, 100);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [active, durationMs, resetKey]);

  // 配置或题目切换后的首帧直接显示新时限，避免旧 remaining 与新 duration 短暂不一致。
  const remainingMs = clock.durationMs === durationMs && clock.resetKey === resetKey ? clock.value : durationMs;
  return {
    remainingMs,
    paused,
    seconds: Math.ceil(remainingMs / 1000),
    progress: durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0,
  };
}
