"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cx } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "词库" },
  { href: "/import", label: "导入" },
  { href: "/skill", label: "AI Skill" },
  { href: "/settings", label: "设置" },
];

export function TopNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useAppStore((s) => s.settings.theme);
  const setSettings = useAppStore((s) => s.setSettings);
  const isDark = theme === "dark" || (theme === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-5 border-b border-gray-300 bg-background-100/85 px-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="t-h-16 tracking-[-0.02em]">WulonVocab</span>
      </Link>
      <nav className="flex items-center gap-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active ? "bg-gray-100 font-medium text-gray-1000" : "text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {right}
        <IconButton
          label={isDark ? "切换浅色" : "切换深色"}
          onClick={() => setSettings({ theme: isDark ? "light" : "dark" })}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </div>
    </header>
  );
}
