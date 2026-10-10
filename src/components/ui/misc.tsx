"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cx } from "@/lib/utils";
import type { AccentId } from "@/lib/types";
import { ACCENTS } from "@/lib/paper";

/* ---------------- Badge ---------------- */

export const badgeVariants = cva(
  "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full font-medium",
  {
    variants: {
      variant: {
        gray: "bg-gray-100 text-gray-1000",
        blue: "bg-blue-100 text-blue-900 dark:bg-blue-200",
        green: "bg-green-800/10 text-green-900",
        amber: "bg-amber-700/15 text-amber-900",
        red: "bg-red-700/10 text-red-900",
        violet: "bg-purple-700/10 text-purple-700",
        teal: "bg-teal-700/10 text-teal-700",
        solid: "bg-gray-1000 text-background-100",
      },
      size: {
        sm: "h-5 px-2 text-[11px]",
        md: "h-6 px-2.5 text-[12px]",
        lg: "h-8 px-3 text-[14px]",
      },
    },
    defaultVariants: { variant: "gray", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cx(badgeVariants({ variant, size }), className)} {...props} />;
}

export const ACCENT_CHIP_CLASS: Record<AccentId, string> = {
  blue: "bg-blue-100 text-blue-900 border-blue-400/60",
  violet: "bg-purple-700/10 text-purple-700 border-purple-700/20",
  teal: "bg-teal-700/10 text-teal-700 border-teal-700/20",
  amber: "bg-amber-700/15 text-amber-900 border-amber-700/25",
  rose: "bg-red-700/10 text-red-900 border-red-700/20",
  green: "bg-green-800/10 text-green-900 border-green-800/20",
  gray: "bg-gray-100 text-gray-1000 border-gray-400",
};

export function Chip({
  children,
  color = "gray",
  className,
  onRemove,
}: {
  children: React.ReactNode;
  color?: AccentId;
  className?: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[12px]",
        ACCENT_CHIP_CLASS[color],
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-1 grid size-4 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100"
          aria-label="移除"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl bg-background-200 p-4 shadow-geist-border", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  desc,
  right,
  className,
}: {
  children: React.ReactNode;
  desc?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="t-h-14 text-gray-1000">{children}</h3>
        {desc ? <p className="t-label-13 mt-0.5 text-gray-800">{desc}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/* ---------------- SegmentedControl ---------------- */

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  grow,
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "sm" | "md";
  /** 撑满容器宽度，各分段等分（表单控件形态） */
  grow?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5",
        grow && "flex w-full",
        className,
      )}
    >
      {options.map((opt) => (
        <ToggleGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          title={opt.title}
          className={cx(
            "inline-flex items-center justify-center gap-1.5 rounded-[5px] text-gray-900 transition-colors",
            size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
            grow && "min-w-0 flex-1",
            "hover:text-gray-1000 data-[state=on]:bg-background-100 data-[state=on]:text-gray-1000 data-[state=on]:shadow-geist-xs",
          )}
        >
          {opt.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/* ---------------- EmptyState / Spinner / Kbd ---------------- */

export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon ? <div className="grid size-11 place-items-center rounded-full bg-gray-100 text-gray-900">{icon}</div> : null}
      <div>
        <div className="t-h-14 text-gray-1000">{title}</div>
        {desc ? <p className="t-label-13 mx-auto mt-1 max-w-[42ch] text-gray-800">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-gray-800", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="t-mono-12 inline-flex h-5 min-w-5 items-center justify-center rounded border border-gray-400 bg-gray-100 px-1.5 text-gray-900">
      {children}
    </kbd>
  );
}

/* ---------------- 颜色选择器 ---------------- */

export function AccentPicker({
  value,
  onChange,
  className,
}: {
  value: AccentId;
  onChange: (v: AccentId) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
        <button
          key={id}
          type="button"
          title={ACCENTS[id].name}
          aria-label={ACCENTS[id].name}
          onClick={() => onChange(id)}
          className={cx(
            "size-6 rounded-full transition-transform hover:scale-110",
            value === id ? "ring-2 ring-gray-1000 ring-offset-2 ring-offset-background-100" : "shadow-geist-border",
          )}
          style={{ background: ACCENTS[id].hex }}
        />
      ))}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px w-full bg-gray-300", className)} />;
}
