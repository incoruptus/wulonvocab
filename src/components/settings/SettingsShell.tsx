import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";

/** 设置二级页外壳：顶栏 + 返回「设置」+ 标题说明 */
export function SettingsShell({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:py-8">
        <div>
          <Link
            href="/settings"
            className="t-label-12 inline-flex items-center gap-1 text-gray-800 transition-colors hover:text-gray-1000"
          >
            <ChevronLeft className="size-3.5" /> 设置
          </Link>
          <h1 className="t-h-24 mt-2">{title}</h1>
          {desc ? <p className="t-label-13 mt-1 max-w-[64ch] text-gray-800">{desc}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
