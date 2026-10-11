"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { cx } from "@/lib/utils";

/**
 * Geist 风格可搜索下拉（Popover + 过滤列表）
 * ------------------------------------------------------------
 * 长列表（模型清单等）与需要键盘/搜索的场景；`allowCustom` 允许直接使用输入的自定义值。
 */

export interface ComboboxOption {
  value: string;
  label: string;
  /** 右侧小标注（如「视觉 · 免费 · 128K」） */
  badge?: string;
  /** 额外搜索关键词（默认用 label/value） */
  keywords?: string;
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  searchPlaceholder = "输入以筛选…",
  emptyText = "没有匹配项",
  allowCustom = false,
  disabled,
  loading,
  className,
  contentClassName,
  id,
  searchAriaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  contentClassName?: string;
  /** 供 <label htmlFor> 关联（配合 Field 自动注入） */
  id?: string;
  /** 搜索框的可访问名称（默认用 placeholder） */
  searchAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(
          (o) =>
            (o.keywords ?? `${o.label} ${o.value}`).toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        )
      : options;
    return list.slice(0, 200);
  }, [options, query]);

  const rows = useMemo(() => {
    const base = filtered.map((o) => ({ value: o.value, label: o.label, badge: o.badge, custom: false }));
    if (allowCustom) {
      const q = query.trim();
      if (q && !options.some((o) => o.value === q)) {
        base.unshift({ value: q, label: `使用「${q}」`, badge: undefined, custom: true });
      }
    }
    return base;
  }, [filtered, allowCustom, options, query]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      // 打开时重置查询与高亮（在事件处理器里做，避免 effect 内级联渲染）
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const pick = (v: string) => {
    onValueChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, rows.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[Math.min(active, rows.length - 1)];
      if (row) pick(row.value);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cx(
            "flex w-full items-center justify-between gap-2 rounded-md bg-background-100 px-3 py-2 text-left text-sm text-gray-1000 shadow-geist-border transition-colors",
            "hover:bg-gray-100/60 disabled:bg-gray-100 disabled:text-gray-700",
            "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
            className,
          )}
        >
          <span className={cx("truncate", !value && "text-gray-700")}>{value || placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-gray-800" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cx("w-[var(--radix-popover-trigger-width)] max-w-[min(92vw,30rem)] p-2", contentClassName)}
      >
        <div className="flex items-center gap-2 rounded-md bg-background-200 px-2.5 py-1.5 shadow-geist-border">
          <Search className="size-3.5 shrink-0 text-gray-700" />
          <input
            ref={inputRef}
            value={query}
            aria-label={searchAriaLabel ?? searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-1000 outline-none placeholder:text-gray-700"
          />
          {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin text-gray-700" /> : null}
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto scroll-thin" role="listbox" aria-label={searchAriaLabel ?? placeholder}>
          {rows.length === 0 ? (
            <div className="t-label-12 px-2.5 py-4 text-center text-gray-700">
              {options.length === 0 && allowCustom ? "直接输入模型名后回车使用" : emptyText}
            </div>
          ) : null}
          {rows.map((row, i) => (
            <button
              key={`${row.value}-${i}`}
              type="button"
              role="option"
              aria-selected={value === row.value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(row.value)}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left",
                i === active ? "bg-gray-100" : "",
                row.custom ? "text-blue-900" : "text-gray-1000",
              )}
            >
              <span className="t-mono-13 min-w-0 flex-1 truncate">{row.label}</span>
              {row.badge ? <span className="t-label-12 shrink-0 text-gray-700">{row.badge}</span> : null}
              {value === row.value ? <Check className="size-3.5 shrink-0 text-gray-900" /> : null}
            </button>
          ))}
          {filtered.length > 200 ? (
            <div className="t-label-12 px-2.5 py-1.5 text-gray-700">
              还有 {filtered.length - 200} 项——继续输入以缩小范围
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
