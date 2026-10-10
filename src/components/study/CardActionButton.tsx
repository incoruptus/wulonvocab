"use client";

import type { MouseEvent, ReactNode } from "react";
import { Kbd } from "@/components/ui/misc";
import { cx } from "@/lib/utils";

/**
 * 卡片词头圆形操作按钮（朗读 / 星标 / 跳过等）。
 * 有键盘快捷键的动作必须传 `hint`：桌面（宽屏 + 精细指针）在右下角显示键位角标。
 */
export function CardActionButton({
  label,
  hint,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** 激活态（如已星标）整体着色 */
  active?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        "relative grid size-11 shrink-0 place-items-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200",
        active ? "text-amber-700" : "text-gray-900",
        className,
      )}
    >
      {children}
      {hint ? (
        <span className="wv-desktop-only absolute -bottom-1 -right-1 hidden sm:inline-flex">
          <Kbd className="h-4 min-w-4 px-1 text-[9px]">{hint}</Kbd>
        </span>
      ) : null}
    </button>
  );
}
