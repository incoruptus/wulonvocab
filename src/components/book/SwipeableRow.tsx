"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * 列表行滑动操作（参考 iOS 滑动操作规范）
 * ------------------------------------------------------------------
 * - 右滑（leading）：露出「选择」动作；滑过阈值释放 = 进入多选；
 * - 左滑（trailing）：露出「星标 / 删除」；整条滑过阈值释放 = 删除；
 * - 轴锁 8px、释放阈值 50%、全滑阈值 55% 宽度或 30%+快速滑动；
 * - touch-action: pan-y（垂直滚动归浏览器，水平归我们）；
 * - 仅一行展开由父级控制（open / onOpenChange）；滚动时父级负责收起。
 */

export interface TrailingAction {
  label: string;
  icon: LucideIcon;
  tone: "amber" | "red";
  onAction: () => void;
}

export interface SwipeableRowProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leading?: { label: string; icon: LucideIcon; onAction: () => void };
  trailing?: TrailingAction[];
  /** 多选模式或禁用时关闭滑动 */
  disabled?: boolean;
}

const AXIS_LOCK = 8;
const OPEN_RATIO = 0.5;
const SNAP_MS = 220;

const TONE_CLASS: Record<TrailingAction["tone"], string> = {
  amber: "bg-amber-700 text-gray-1000",
  red: "bg-red-900 text-white",
};

export function SwipeableRow({ children, open, onOpenChange, leading, trailing = [], disabled }: SwipeableRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    dragging: false,
    engaged: false,
    startX: 0,
    startY: 0,
    dx: 0,
    width: 0,
    armedRight: false,
    armedLeft: false,
    suppressClickUntil: 0,
  });

  const leadWidth = leading ? 96 : 0;
  const trailWidth = trailing.length * 88;

  const setTransform = useCallback((x: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${SNAP_MS}ms cubic-bezier(0.2, 0, 0, 1)` : "none";
    el.style.transform = `translate3d(${x}px, 0, 0)`;
  }, []);

  const snapTo = useCallback(
    (target: "open" | "closed" | "openTrail") => {
      if (target === "closed") {
        setTransform(0, true);
        onOpenChange(false);
      } else if (target === "open") {
        setTransform(leadWidth, true);
        onOpenChange(true);
      } else {
        setTransform(-trailWidth, true);
        onOpenChange(true);
      }
    },
    [leadWidth, trailWidth, setTransform, onOpenChange],
  );

  // 受控回流：外部要求关闭/打开时同步位移动画
  useEffect(() => {
    if (stateRef.current.dragging) return;
    const el = contentRef.current;
    if (!el) return;
    const current = stateRef.current.dx;
    if (!open && Math.abs(current) > 1) snapTo("closed");
    // open 状态仅由滑动/动作触发，此处不主动展开
  }, [open, snapTo]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const s = stateRef.current;
      s.dragging = true;
      s.engaged = false;
      s.startX = e.clientX;
      s.startY = e.clientY;
      s.dx = 0;
      s.armedRight = false;
      s.armedLeft = false;
      s.width = rootRef.current?.getBoundingClientRect().width ?? 360;
      const el = contentRef.current;
      if (el) el.style.willChange = "transform";
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = stateRef.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      if (!s.engaged) {
        if (Math.abs(dx) > AXIS_LOCK && Math.abs(dx) > Math.abs(dy) * 1.2) {
          s.engaged = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          s.dragging = false;
          return;
        } else {
          return;
        }
      }

      let x = dx;
      // 边界橡皮筋
      if (x > leadWidth) x = leadWidth + Math.min(32, (x - leadWidth) * 0.25);
      if (x < -trailWidth) x = -trailWidth - Math.min(32, (-x - trailWidth) * 0.25);
      s.dx = x;
      setTransform(x, false);

      // 全滑「武装」提示
      s.armedRight = Boolean(leading) && x >= Math.min(s.width * 0.55, 240);
      s.armedLeft =
        trailing.length > 0 &&
        (-x >= Math.min(s.width * 0.55, 240) || (-x >= 0.3 * s.width && Math.abs(dx) > 60));
    },
    [leadWidth, trailWidth, leading, trailing.length, setTransform],
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const s = stateRef.current;
      if (!s.dragging) return;
      s.dragging = false;
      const el = contentRef.current;
      if (el) el.style.willChange = "";
      if (!s.engaged) return;
      if (Math.abs(s.dx) > 6) s.suppressClickUntil = Date.now() + 350;

      if (s.armedRight && leading) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* noop */
        }
        snapTo("closed");
        leading.onAction();
        return;
      }
      if (s.armedLeft && trailing.length) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* noop */
        }
        snapTo("closed");
        trailing[trailing.length - 1].onAction(); // 整条左滑 = 删除（trailing 最后一项）
        return;
      }

       // 常规吸附
      if (s.dx > leadWidth * OPEN_RATIO && leading) snapTo("open");
      else if (s.dx < -trailWidth * OPEN_RATIO && trailing.length) snapTo("openTrail");
      else snapTo("closed");
      void e;
    },
    [leading, trailing, snapTo, leadWidth, trailWidth],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current;
    if (Date.now() < s.suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // 已展开时，第一次点击内容区先收起
    if (Math.abs(s.dx) > 1) {
      e.preventDefault();
      e.stopPropagation();
      snapTo("closed");
      stateRef.current.dx = 0;
    }
  }, [snapTo]);

  return (
    <div ref={rootRef} className="relative overflow-hidden" style={{ touchAction: "pan-y" }}>
      {/* 左侧（右滑露出）：选择 */}
      {leading ? (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: leadWidth }} aria-hidden={!open} inert={!open}>
          <button
            type="button"
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-blue-700 text-white"
            onClick={() => {
              snapTo("closed");
              leading.onAction();
            }}
          >
            <leading.icon className="size-4" />
            <span className="text-[11px]">{leading.label}</span>
          </button>
        </div>
      ) : null}

      {/* 右侧（左滑露出）：星标 / 删除 */}
      {trailing.length ? (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: trailWidth }} aria-hidden={!open} inert={!open}>
          {trailing.map((a) => (
            <button
              key={a.label}
              type="button"
              className={cx("flex h-full w-[88px] flex-col items-center justify-center gap-0.5", TONE_CLASS[a.tone])}
              onClick={() => {
                snapTo("closed");
                a.onAction();
              }}
            >
              <a.icon className="size-4" />
              <span className="text-[11px]">{a.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* 内容层 */}
      <div
        ref={contentRef}
        className="relative bg-background-100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
