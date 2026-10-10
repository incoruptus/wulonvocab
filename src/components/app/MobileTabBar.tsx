"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Brain, Settings, Sparkles, Upload } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * 移动端底部导航栏（<sm 显示）：
 * 顶栏在窄屏只保留品牌与页面操作，主导航集中到底部拇指区；
 * 学习会话与导出工作室为沉浸式路由，隐藏本栏（各自有专用底栏）。
 */
const TABS = [
  { label: "学习", icon: Brain, href: "/learn", match: ["/learn", "/study"] },
  { label: "词库", icon: BookOpen, href: "/books", match: ["/books", "/book"] },
  { label: "导入", icon: Upload, href: "/import", match: ["/import"] },
  { label: "Skill", icon: Sparkles, href: "/skill", match: ["/skill"] },
  { label: "设置", icon: Settings, href: "/settings", match: ["/settings"] },
] as const;

const HIDDEN_PREFIXES = ["/study", "/book/export"];

export function MobileTabBar() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-300 bg-background-100/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid h-14 grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5 transition-colors",
                active ? "text-blue-900" : "text-gray-700 hover:text-gray-1000",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
              <span className={cx("text-[11px] leading-none", active && "font-medium")}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
