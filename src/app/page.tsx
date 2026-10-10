import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Brain, Coffee, ExternalLink, FileDown, Layers, Sparkles, Upload } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { Badge, Card } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "WulonVocab · 单词本工坊",
  description: "动态字段、间隔重复学习、打印级导出的本地优先单词本软件。",
};

const FEATURES = [
  {
    icon: Layers,
    title: "动态字段管理",
    desc: "音标、词性释义、词族、词性变换、联想助记、例句、情景标签……14 类字段随意增删、拖动排序；改字段名，已有数据自动跟着搬。",
    href: "/books",
    link: "进入词库",
  },
  {
    icon: Brain,
    title: "间隔重复学习",
    desc: "基于 FSRS 的智能排程：四档评级直观显示下次间隔，支持翻卡自评与看词选义选择题两种模式，数据只在你的设备上。",
    href: "/learn",
    link: "打开学习中心",
  },
  {
    icon: FileDown,
    title: "打印级导出",
    desc: "A4 / B5 / A5 / 16 开 / 32 开；双栏词典版式、封面与索引、镜像装订边距；矢量 PDF 文字可搜索，PNG 最高 384 DPI。",
    href: "/books",
    link: "选择一本词书",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-10 sm:px-6 sm:py-16">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-300 bg-gradient-to-br from-background-100 to-background-200 px-6 py-12 sm:px-12 sm:py-16">
          <div
            className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full opacity-[0.12]"
            style={{ background: "radial-gradient(circle, #0068d6, transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-40 size-72 rounded-full opacity-[0.10]"
            style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black text-white shadow-geist-border"
            >
              <Coffee className="size-6" strokeWidth={2.2} />
            </span>
            <span className="t-h-24 tracking-[-0.02em]">WulonVocab</span>
            <Badge variant="blue" size="sm">
              本地优先 · 打印级排版
            </Badge>
          </div>
          <h1 className="t-h-32 mt-6 max-w-2xl text-gray-1000">把单词，做成一本真正精美的书。</h1>
          <p className="t-copy-14 mt-4 max-w-xl text-gray-900">
            字段自己定，JSON 直接导；间隔重复把单词刻进长期记忆，导出 A4 / B5 / A5
            打印装订，就是一本书。数据只存在这台设备上。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/learn"
              className="t-button inline-flex h-11 items-center gap-2 rounded-lg bg-gray-1000 px-5 text-background-100 transition-colors hover:bg-gray-900"
            >
              <Brain className="size-4" /> 开始学习
            </Link>
            <Link
              href="/books"
              className="t-button inline-flex h-11 items-center gap-2 rounded-lg bg-background-100 px-5 text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100"
            >
              <BookOpen className="size-4" /> 我的词库
            </Link>
            <Link
              href="/import"
              className="t-button inline-flex h-11 items-center gap-2 rounded-lg px-4 text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-1000"
            >
              <Upload className="size-4" /> 导入词表 <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        {/* 三大能力 */}
        <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="flex flex-col p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-gray-100 text-gray-900">
                <f.icon className="size-5" />
              </span>
              <div className="t-h-16 mt-3">{f.title}</div>
              <p className="t-label-13 mt-2 flex-1 leading-relaxed text-gray-800">{f.desc}</p>
              <Link href={f.href} className="t-label-13 mt-3 inline-flex items-center gap-1 text-blue-900 hover:underline">
                {f.link} <ArrowRight className="size-3.5" />
              </Link>
            </Card>
          ))}
        </section>

        {/* 学习模式 */}
        <section className="mt-10 rounded-2xl border border-gray-300 bg-background-200 p-6">
          <div className="t-h-20">两种学习模式，随你切换</div>
          <p className="t-label-13 mt-1 max-w-2xl text-gray-800">
            「翻卡自评」先回忆再对照评级；「选择题」从四个释义中选出正确的一项（干扰项来自词书内同词性释义）。
            忘记的词会在本轮稍后再次出现，进度按 FSRS 智能排程自动安排。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">翻卡自评</span>
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">看词选义选择题</span>
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">系统语音自动发音</span>
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">键盘 DFJK / WEIO 快捷操作</span>
          </div>
        </section>

        {/* AI Skill */}
        <section className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-gray-300 bg-background-100 p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gray-1000 text-background-100">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1 basis-[16rem]">
            <div className="t-h-16">把需求交给 AI，得到可直接导入的词表</div>
            <p className="t-label-13 mt-1 text-gray-800">
              「帮我整理 50 个雅思写作高频词，要有词族、搭配和真题例句」——AI 按 Skill 规范输出 JSON，导入后直接排版导出。
            </p>
          </div>
          <Link
            href="/skill"
            className="t-button inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-background-100 px-3.5 text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100 sm:w-auto"
          >
            查看 AI Skill <ArrowRight className="size-3.5" />
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 pt-6">
          <span className="t-label-12 text-gray-700">WulonVocab · 词库、字段与学习进度只存在这台设备的浏览器里（IndexedDB）</span>
          <div className="flex items-center gap-4">
            <a
              href="https://incoruptus.github.io/wulonvocab/"
              className="t-label-12 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000"
              target="_blank"
              rel="noreferrer"
            >
              在线版
            </a>
            <a
              href="https://github.com/incoruptus/wulonvocab"
              className="t-label-12 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3.5" /> GitHub
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
