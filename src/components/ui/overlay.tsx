"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { cx } from "@/lib/utils";

/* ---------------- Dialog（Geist Modal：12px 圆角 + modal 阴影） ---------------- */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** 内容最大宽度 class，如 max-w-2xl */
  widthClass?: string;
}

export function Dialog({ open, onOpenChange, children, className, widthClass = "max-w-xl" }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] transition-opacity data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content
          className={cx(
            "fixed left-1/2 top-[10%] z-50 w-[92vw] -translate-x-1/2 rounded-xl bg-background-100 shadow-geist-modal focus:outline-none",
            "max-h-[82vh] overflow-hidden flex flex-col transition-all duration-200 ease-swift data-[state=closed]:scale-[.97] data-[state=closed]:opacity-0",
            widthClass,
            className,
          )}
        >
          {children}
          <DialogPrimitive.Close
            aria-label="关闭"
            className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogHeader({
  title,
  desc,
  children,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-300 px-5 py-4 pr-12">
      <DialogPrimitive.Title className="t-h-16 text-gray-1000">{title}</DialogPrimitive.Title>
      {desc ? (
        <DialogPrimitive.Description className="t-label-13 mt-1 text-gray-800">{desc}</DialogPrimitive.Description>
      ) : null}
      {children}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("flex items-center justify-end gap-2 border-t border-gray-300 px-5 py-3", className)}>
      {children}
    </div>
  );
}

/* ---------------- DropdownMenu（菜单 12px 圆角） ---------------- */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  children,
  align = "start",
  sideOffset = 6,
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cx(
          "z-50 min-w-44 overflow-hidden rounded-xl bg-background-100 p-1 shadow-geist-menu",
          "data-[state=open]:animate-none",
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cx(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] outline-none transition-colors",
        danger ? "text-red-900 focus:bg-red-700/10" : "text-gray-1000 focus:bg-gray-100",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="t-label-12 px-2.5 pb-1 pt-2 text-gray-800">{children}</DropdownMenuPrimitive.Label>
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="mx-1 my-1 h-px bg-gray-300" />;
}

/* ---------------- Popover ---------------- */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  children,
  align = "start",
  sideOffset = 6,
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cx("z-50 rounded-xl bg-background-100 p-3 shadow-geist-menu outline-none", className)}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/* ---------------- Tooltip ---------------- */

export function Tip({
  children,
  tip,
  side = "top",
}: {
  children: React.ReactNode;
  tip: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-gray-1000 px-2 py-1 text-[12px] leading-4 text-background-100 shadow-geist-md"
        >
          {tip}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { TooltipPrimitive };
