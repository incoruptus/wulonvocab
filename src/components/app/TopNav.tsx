"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coffee, Moon, Sun } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useResolvedTheme } from "@/components/app/Providers";
import { cx } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { MobileTabBar } from "@/components/app/MobileTabBar";

const NAV = [
  { href: "/learn", label: "学习" },
  { href: "/books", label: "词库" },
  { href: "/import", label: "导入" },
  { href: "/skill", label: "AI Skill" },
  { href: "/settings", label: "设置" },
];

/**
 * 顶栏：宽度 ≥sm 显示行内导航；窄屏导航移至底部栏（MobileTabBar），
 * 顶栏只保留品牌、页面操作与主题切换，避免与操作按钮拥挤。
 */
export function TopNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const setSettings = useAppStore((s) => s.setSettings);
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-gray-300 bg-background-100/85 px-3 backdrop-blur sm:gap-5 sm:px-4">
        <Link href="/" className="flex min-w-0 shrink items-center gap-2.5">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-black text-white">
            <Coffee className="size-4" strokeWidth={2.2} />
          </span>
          <span className="t-h-16 truncate tracking-[-0.02em]">WulonVocab</span>
        </Link>
        <nav className="no-scrollbar hidden min-w-0 items-center gap-0.5 overflow-x-auto sm:flex">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  active ? "bg-gray-100 font-medium text-gray-1000" : "text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {right}
          <IconButton
            label={isDark ? "切换浅色" : "切换深色"}
            onClick={() => setSettings({ theme: isDark ? "light" : "dark" })}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
        </div>
      </header>
      <MobileTabBar />
    </>
  );
}
