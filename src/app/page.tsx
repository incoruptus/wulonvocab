import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Brain, Coffee, ExternalLink, FileDown, Layers, Upload } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { AiGenerateHero } from "@/components/import/AiGenerateHero";
import { Badge, Card } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "WulonVocab · 乌龙单词",
  description: "你攒下的词，值得被认真对待——本地优先的词库：动态字段、间隔重复、打印级排版。",
};

const FEATURES = [
  {
    icon: Layers,
    title: "字段随你定",
    desc: "音标、释义、词族、词形变化、搭配、例句、情景标签……十几种字段随你添减、拖动排序；改了字段名，老数据自己跟着走。",
    href: "/books",
    link: "翻翻我的词库",
  },
  {
    icon: Brain,
    title: "记得刚刚好",
    desc: "FSRS 把复习安排在最该出现的时刻：翻卡自评，或从四个释义里认出它；四档评级直给下次间隔。数据不出设备。",
    href: "/learn",
    link: "看看今天学什么",
  },
  {
    icon: FileDown,
    title: "落成纸上的样子",
    desc: "从 A4 到 32 开；双栏词典版式、封面与索引、镜像装订边距；矢量 PDF 文字可搜，PNG 最高 384 DPI——像一本真的书。",
    href: "/books",
    link: "挑一本去排版",
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
            <span className="t-label-14 text-gray-700">乌龙单词</span>
            <Badge variant="blue" size="sm">
              本地优先 · 打印级排版
            </Badge>
          </div>
          <h1 className="t-h-32 mt-6 max-w-2xl text-gray-1000">把单词，做成一本真正精美的书。</h1>
          <p className="t-copy-14 mt-4 max-w-xl text-gray-900">
            你攒下的词，值得被认真对待——字段自己定，词表随时导入；间隔重复把它们刻进长期记忆；
            排好版、打印装订，就是一本属于自己的书。数据只住在这台设备里。
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
            「翻卡自评」先回忆，再翻面对照；「看词选义」从四个释义里认出对的那一个。
            忘记的词稍后还会来敲一次门——何时再见面，交给它安排。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">翻卡自评</span>
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">看词选义选择题</span>
            <span className="rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">系统语音自动发音</span>
            <span className="wv-desktop-only rounded-full bg-background-100 px-3 py-1 text-[13px] shadow-geist-border">键盘 DFJK / WEIO 快捷操作</span>
          </div>
        </section>

        {/* AI 生成词库（首页入口） */}
        <section className="mt-10 rounded-2xl border border-gray-300 bg-background-100 p-6">
          <AiGenerateHero />
          <p className="t-label-12 mt-4 border-t border-gray-300 pt-3 text-gray-700">
            更愿意用自己顺手的 AI？把{" "}
            <Link href="/skill" className="text-blue-900 hover:underline">
              AI Skill 规范文件
            </Link>{" "}
            交给它，产出的 JSON 一样可以导入。
          </p>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 pt-6">
          <span className="t-label-12 text-gray-700">词库与学习进度只住在你的设备里 · 没有账号，也没有云端</span>
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
