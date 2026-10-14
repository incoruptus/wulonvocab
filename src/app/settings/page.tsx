import Link from "next/link";
import { Archive, ChevronRight, Database, GraduationCap, Info, Palette, RefreshCw, Wifi } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { Card } from "@/components/ui/misc";

/** 设置索引页：分组入口，具体内容都在二级页（/settings/*） */
const GROUPS = [
  {
    label: "学习与内容",
    items: [
      { href: "/settings/study", icon: GraduationCap, title: "学习", desc: "复习参数、选择题题型、直选键位与退出去向" },
      { href: "/settings/sources", icon: Wifi, title: "检索数据源", desc: "在线词典、AI 与自定义接口" },
      { href: "/settings/dictionaries", icon: Database, title: "本地词库", desc: "内置离线词典与自行导入的数据集" },
    ],
  },
  {
    label: "应用",
    items: [
      { href: "/settings/appearance", icon: Palette, title: "外观", desc: "主题与强调色（本机偏好）" },
      { href: "/settings/sync", icon: RefreshCw, title: "跨端同步", desc: "多台设备之间自动对齐" },
      { href: "/settings/data", icon: Archive, title: "备份与恢复", desc: "导出备份、恢复与清空数据" },
      { href: "/settings/about", icon: Info, title: "关于", desc: "版本、鸣谢与技术栈" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="t-h-24">设置</h1>
          <p className="t-label-13 mt-1 text-gray-800">词库与设置默认保存在这台设备上，开启跨端同步后会在多台设备之间自动对齐。</p>
        </div>
        {GROUPS.map((group) => (
          <section key={group.label} className="space-y-2">
            <h2 className="t-label-12 font-medium text-gray-700">{group.label}</h2>
            <Card className="overflow-hidden p-0">
              {group.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-100 " +
                      (i > 0 ? "border-t border-gray-200" : "")
                    }
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-900">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-label-14 block font-medium text-gray-1000">{item.title}</span>
                      <span className="t-label-12 block text-gray-700">{item.desc}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-gray-700" />
                  </Link>
                );
              })}
            </Card>
          </section>
        ))}
      </main>
    </div>
  );
}
