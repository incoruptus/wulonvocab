"use client";

import { cloneElement, forwardRef, isValidElement, useId } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Loader2 } from "lucide-react";
import { cx } from "@/lib/utils";

/* ---------------- 输入框 ---------------- */

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          "h-9 w-full rounded-md bg-background-100 px-3 text-sm text-gray-1000 shadow-geist-border transition-shadow",
          "placeholder:text-gray-700 disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx(
          "w-full rounded-md bg-background-100 px-3 py-2 text-sm text-gray-1000 shadow-geist-border transition-shadow",
          "placeholder:text-gray-700 disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          className,
        )}
        {...props}
      />
    );
  },
);

/* ---------------- 开关 ---------------- */

export const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cx(
        "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-gray-400 transition-colors",
        "data-[state=checked]:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-[2px] rounded-full bg-white shadow-geist-xs transition-transform data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  );
});

/* ---------------- 复选框 ---------------- */

export const Checkbox = forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cx(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-background-100 shadow-geist-border transition-colors",
        "data-[state=checked]:bg-gray-1000 data-[state=checked]:text-background-100",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

/* ---------------- 滑杆 ---------------- */

export const Slider = forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { ariaLabel?: string }
>(function Slider({ className, ariaLabel, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cx("relative flex h-5 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-300">
        <SliderPrimitive.Range className="absolute h-full bg-gray-1000" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block size-3.5 rounded-full bg-background-100 shadow-geist-border outline-none transition-transform hover:scale-110 focus-visible:shadow-[0_0_0_2px_var(--ds-background-100),0_0_0_4px_var(--ds-focus-color)]"
      />
    </SliderPrimitive.Root>
  );
});

/* ---------------- 表单行 ---------------- */

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
  inline,
}: {
  label?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  // 把 id 注入子控件，保证 <label htmlFor> 真正关联（读屏/点击标签聚焦）
  const control =
    isValidElement(children) && !(children.props as { id?: string }).id
      ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
      : children;
  if (inline) {
    return (
      <div className={cx("flex items-center justify-between gap-3", className)}>
        <div className="min-w-0">
          <label htmlFor={id} className="t-label-14 block text-gray-1000">
            {label}
          </label>
          {hint ? <p className="t-label-12 mt-0.5 text-gray-800">{hint}</p> : null}
        </div>
        <div className="shrink-0" id={`${id}-ctl`}>
          {control}
        </div>
      </div>
    );
  }
  return (
    <div className={cx("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="t-label-13 block font-medium text-gray-900">
          {label}
        </label>
      ) : null}
      {control}
      {hint ? <p className="t-label-12 text-gray-800">{hint}</p> : null}
    </div>
  );
}

/** 开关行（标签 + 说明 + 开关）；loading：等待云端确认时显示转圈并禁用 */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  loading,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  /** label 为空（如行内仅有开关）时的可访问名称 */
  ariaLabel?: string;
  /** 同步确认中：转圈替代开关、禁止再改 */
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <div className="t-label-14 text-gray-1000">{label}</div>
        {hint ? <div className="t-label-12 text-gray-800">{hint}</div> : null}
      </div>
      {loading ? (
        <span className="grid h-5 w-9 place-items-center" aria-busy="true" aria-label="正在同步到云端">
          <Loader2 className="size-4 animate-spin text-gray-800" />
        </span>
      ) : (
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel ?? (label || undefined)}
        />
      )}
    </div>
  );
}
