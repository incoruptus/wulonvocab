"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Download, FileJson, FolderTree, Sparkles, Terminal } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import { assetPath } from "@/lib/paths";
import { copyText } from "@/lib/utils";

const PROMPT_TEMPLATE = `请使用 wulonvocab-json skill，帮我生成一份可直接导入 WulonVocab 的单词本 JSON：
- 主题/范围：考研英语核心词汇
- 数量：30 个
- 字段要求：音标、词性与释义（含用法/句型/例句/近义词）、词族、词性变换、常用搭配、联想与助记、情景标签
- 例句：优先真实的词典例句，标注出处
- 输出：完整的 JSON 代码块`;

const SCHEMA_SNIPPET = `{
  "format": "wulonvocab",
  "version": 1,
  "wordbook": { "name": "考研核心词汇 · 30", "tags": ["考研"] },
  "entries": [
    {
      "headword": "abandon",
      "tags": ["cet4", "ky"],
      "values": {
        "phonetic": { "uk": "/əˈbændən/", "us": "/əˈbændən/" },
        "senses": [
          {
            "pos": "v.",
            "translation": "抛弃；遗弃（尤指对你有责任的人）",
            "definition": "to leave sb, especially sb you are responsible for",
            "examples": [
              { "en": "The baby had been abandoned by its mother.", "zh": "这个婴儿被母亲遗弃了。", "source": "OALD" }
            ],
            "usage": "常用被动 be abandoned by",
            "patterns": ["abandon sb/sth"],
            "synonyms": ["desert", "leave", "forsake"],
            "collocations": ["abandon sb to their fate"],
            "notes": "abandon hope 放弃希望（考研高频）"
          }
        ],
        "family": [
          { "key": "abandonment", "value": "n. 遗弃；放弃" },
          { "key": "abandoned", "value": "adj. 被遗弃的" }
        ],
        "transforms": [
          { "form": "abandons", "pos": "v.", "note": "第三人称单数" },
          { "form": "abandoned", "pos": "v.", "note": "过去式 / 过去分词" }
        ],
        "associations": ["a（一个）+ band（带子）+ on：丢在路边的带子无人认领 → 抛弃"],
        "contexts": ["考研", "新闻", "文学"]
      }
    }
  ]
}`;

const FILES = [
  { path: "SKILL.md", desc: "Skill 主指令：工作流、字段规范、自检清单" },
  { path: "references/schema.md", desc: "完整字段类型参考与容错规则" },
  { path: "examples/example-abandon.json", desc: "完整示例（牛津词典风）" },
  { path: "examples/example-minimal.json", desc: "极简示例（快速上手）" },
  { path: "scripts/validate.mjs", desc: "零依赖校验脚本：node validate.mjs file.json" },
];

export default function SkillPage() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:space-y-8 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="blue" size="sm">
              <Sparkles className="size-3" /> AI Skill · wulonvocab-json
            </Badge>
            <h1 className="t-h-32 mt-3">让 AI 替你整理词表</h1>
            <p className="t-copy-14 mt-2 max-w-2xl text-gray-900">
              把 Skill 交给任意 AI（Kilo / Claude / ChatGPT / Cursor…），描述你的需求，AI 会输出符合 WulonVocab
              规范的 JSON。导入本应用后自动排版，直接进入导出打印流程。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={assetPath("/downloads/skill/wulonvocab-json/SKILL.md")} download>
              <Button>
                <Download className="size-4" /> 下载 SKILL.md
              </Button>
            </a>
            <a href={assetPath("/samples/sample-import.json")} download>
              <Button variant="secondary">
                <FileJson className="size-4" /> 示例 JSON
              </Button>
            </a>
          </div>
        </div>

        {/* 工作流 */}
        <Card className="space-y-4">
          <div className="t-h-16">使用流程</div>
          <ol className="space-y-3">
            {[
              { t: "取得 Skill", d: "下载 SKILL.md（及 references / examples / scripts），放入 AI 的 skills 目录，或直接粘贴内容给 AI。" },
              { t: "提出需求", d: "告诉 AI：主题、词数、考试范围、需要哪些字段（词族 / 搭配 / 真题例句…）。" },
              { t: "拿到 JSON", d: "AI 输出完整 JSON 文件；可先用校验脚本检查（node validate.mjs 文件.json）。" },
              { t: "导入 WulonVocab", d: "打开 WulonVocab → 导入 → 选择文件。字段自动识别，排版即刻完成。" },
              { t: "导出成书", d: "进入导出工作室：选纸张（A4/B5/A5…）、双栏版式、封面与索引，导出矢量 PDF / 300DPI PNG，打印装订。" },
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="t-mono-12 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gray-1000 text-background-100">
                  {i + 1}
                </span>
                <div>
                  <div className="t-label-14 font-medium">{step.t}</div>
                  <div className="t-label-13 text-gray-800">{step.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* 提示词模板 */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="t-h-16">提示词模板（可复制）</div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const ok = await copyText(PROMPT_TEMPLATE);
                setCopied(ok);
                if (ok) toast.success("已复制提示词模板");
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} 复制
            </Button>
          </div>
          <pre className="t-mono-13 overflow-x-auto rounded-lg bg-background-200 p-3 text-gray-900 scroll-thin">{PROMPT_TEMPLATE}</pre>
        </Card>

        {/* JSON 结构 */}
        <Card className="space-y-3">
          <div className="t-h-16">JSON 结构速览</div>
          <p className="t-label-13 text-gray-800">
            顶层 <code className="t-mono-13 rounded bg-gray-100 px-1">entries</code> 为词条数组；每条词条的{" "}
            <code className="t-mono-13 rounded bg-gray-100 px-1">values</code> 按字段键组织。schema 可选——省略时应用会自动识别字段类型。
          </p>
          <pre className="t-mono-13 max-h-96 overflow-auto rounded-lg bg-background-200 p-3 text-gray-900 scroll-thin">{SCHEMA_SNIPPET}</pre>
        </Card>

        {/* 文件清单 */}
        <Card className="space-y-3">
          <div className="t-h-16">Skill 文件清单</div>
          <div className="space-y-1.5">
            {FILES.map((f) => (
              <div key={f.path} className="flex items-center gap-3 rounded-lg bg-background-200 p-2.5 shadow-geist-border">
                <FolderTree className="size-4 shrink-0 text-gray-800" />
                <span className="t-mono-13 min-w-0 flex-1 truncate">{f.path}</span>
                <span className="t-label-12 hidden min-w-0 flex-1 truncate text-gray-800 sm:block">{f.desc}</span>
                <a
                  href={assetPath(`/downloads/skill/wulonvocab-json/${f.path}`)}
                  download
                  className="t-label-13 inline-flex shrink-0 items-center gap-1 text-blue-900 hover:underline"
                >
                  <Download className="size-3.5" /> 下载
                </a>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-background-200 p-3">
            <div className="t-label-13 flex items-center gap-1.5 font-medium">
              <Terminal className="size-3.5" /> 校验脚本用法
            </div>
            <pre className="t-mono-13 mt-2 text-gray-900">
{`node scripts/validate.mjs my-words.json
✔ 30 条词条 · 字段：phonetic(30) senses(30) family(21) …
⚠ 2 条词条缺少 senses`}
            </pre>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="t-h-16">安装到各类 AI 工具</div>
          <div className="space-y-2 text-[13px] text-gray-900">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="t-label-13 w-32 shrink-0 font-medium">Kilo / Claude Code</span>
              <span className="t-mono-12">将 <code className="rounded bg-gray-100 px-1">wulonvocab-json/</code> 整个文件夹放入 <code className="rounded bg-gray-100 px-1">.kilo/skills/</code> 或 <code className="rounded bg-gray-100 px-1">~/.claude/skills/</code></span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="t-label-13 w-32 shrink-0 font-medium">Cursor / Windsurf</span>
              <span className="t-mono-12">把 SKILL.md 内容粘贴到项目的 rules 文件（如 <code className="rounded bg-gray-100 px-1">.cursor/rules/wulonvocab.mdc</code>）</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="t-label-13 w-32 shrink-0 font-medium">ChatGPT / 通用</span>
              <span className="t-mono-12">直接粘贴 SKILL.md + 提示词模板，要求输出完整 JSON</span>
            </div>
          </div>
        </Card>

        <div className="flex justify-center pb-4">
          <Link href="/import">
            <Button size="lg">
              去导入词表 <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
