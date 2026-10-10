"use client";

import { forwardRef, useId } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, ChevronDown } from "lucide-react";
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

/* ---------------- 选择器 ---------------- */

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapClassName?: string;
}

export function Select({ className, wrapClassName, children, ...props }: SelectProps) {
  return (
    <div className={cx("relative", wrapClassName)}>
      <select
        className={cx(
          "h-9 w-full appearance-none rounded-md bg-background-100 pl-3 pr-8 text-sm text-gray-1000 shadow-geist-border",
          "disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-800" />
    </div>
  );
}

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
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider({ className, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cx("relative flex h-5 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-300">
        <SliderPrimitive.Range className="absolute h-full bg-gray-1000" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3.5 rounded-full bg-background-100 shadow-geist-border outline-none transition-transform hover:scale-110 focus-visible:shadow-[0_0_0_2px_var(--ds-background-100),0_0_0_4px_var(--ds-focus-color)]" />
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
          {children}
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
      {children}
      {hint ? <p className="t-label-12 text-gray-800">{hint}</p> : null}
    </div>
  );
}

/** 开关行（标签 + 说明 + 开关） */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <div className="t-label-14 text-gray-1000">{label}</div>
        {hint ? <div className="t-label-12 text-gray-800">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
