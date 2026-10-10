"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cx } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.List
      className={cx("inline-flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5", className)}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  disabled,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[13px] text-gray-900 transition-colors",
        "hover:text-gray-1000 disabled:opacity-50",
        "data-[state=active]:bg-background-100 data-[state=active]:text-gray-1000 data-[state=active]:shadow-geist-xs",
        className,
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsPrimitive.Content value={value} className={cx("outline-none", className)}>
      {children}
    </TabsPrimitive.Content>
  );
}
