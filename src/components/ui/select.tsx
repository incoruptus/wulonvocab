"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * Geist 风格下拉（Radix Select 自定义弹层）
 * ------------------------------------------------------------
 * 短列表（服务商 / 纸张 / 样式 / 词性…）用本组件；长列表或需要搜索的用 `Combobox`。
 * 约定：**全站禁止原生 `<select>`**（弹层样式不可控）。
 * value 为 "" 时映射到占位项（Radix 不允许空串值）。
 */

const NONE = "__wv_none__";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  size = "md",
  id,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  size?: "md" | "sm";
  /** 供 <label htmlFor> 关联（配合 Field 自动注入） */
  id?: string;
}) {
  const radixValue = value === "" ? NONE : value;
  return (
    <SelectPrimitive.Root
      value={radixValue}
      onValueChange={(v) => onValueChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-md bg-background-100 text-left text-gray-1000 shadow-geist-border transition-colors",
          "hover:bg-gray-100/60 data-[placeholder]:text-gray-700",
          "disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-sm",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder ?? "请选择"} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-gray-800" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          align="start"
          className={cx(
            "z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] max-w-[min(92vw,30rem)] overflow-hidden rounded-xl bg-background-100 p-1 shadow-geist-menu",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="p-0">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value === "" ? NONE : opt.value}
                disabled={opt.disabled}
                className={cx(
                  "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-[13px] text-gray-1000 outline-none",
                  "data-[highlighted]:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                <SelectPrimitive.ItemText>
                  <span className="block truncate">{opt.label}</span>
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5 text-gray-900" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
