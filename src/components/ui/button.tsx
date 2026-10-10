"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md t-button transition-colors duration-150 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-700",
  {
    variants: {
      variant: {
        default: "bg-gray-1000 text-background-100 hover:bg-gray-900 active:bg-gray-800",
        secondary:
          "bg-background-100 text-gray-1000 shadow-geist-border hover:bg-gray-100 active:bg-gray-200",
        tertiary: "bg-transparent text-gray-1000 hover:bg-gray-100 active:bg-gray-200",
        error: "bg-red-800 text-white hover:bg-red-900 dark:hover:bg-red-700",
        warning: "bg-amber-800 text-gray-1000 hover:bg-amber-700",
        ghost: "bg-transparent text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5",
        lg: "h-10 px-4 text-[15px]",
      },
      shape: {
        rounded: "",
        square: "aspect-square px-0",
        circle: "aspect-square rounded-full px-0",
      },
    },
    defaultVariants: { variant: "default", size: "md", shape: "rounded" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, shape, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(buttonVariants({ variant, size, shape }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonProps {
  label: string;
}

/** 图标按钮：必须提供 aria-label（Geist 可访问性规范） */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = "md", variant = "tertiary", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      size={size}
      variant={variant}
      shape="square"
      className={cx("shrink-0", className)}
      {...props}
    />
  );
});
