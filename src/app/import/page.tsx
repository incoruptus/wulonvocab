"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, FileSpreadsheet, ListOrdered, Sparkles, Upload } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { ImportDialog } from "@/components/import/ImportDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

export default function ImportPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-10">
        <div>
          <h1 className="t-h-24">导入词表</h1>
          <p className="t-copy-14 mt-2 text-gray-900">
            WulonVocab 对数据格式非常宽容：文件里有什么字段，就渲染什么字段。缺少字段结构时会自动识别类型，导入即可自动排版。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <span className="grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-900">
              <FileJson className="size-4" />
            </span>
            <div className="t-h-16 mt-3">WulonVocab JSON</div>
            <p className="t-label-13 mt-1.5 text-gray-800">
              标准格式：{"{ wordbook, schema, entries }"}。schema 可省略，导入时自动推断字段结构。
            </p>
          </Card>
          <Card>
            <span className="grid size-9 place-items-center rounded-lg bg-green-800/10 text-green-900">
              <FileSpreadsheet className="size-4" />
            </span>
            <div className="t-h-16 mt-3">ECDICT / OALD / 通用 CSV</div>
            <p className="t-label-13 mt-1.5 text-gray-800">
              自动识别 word / phonetic / translation / exchange / tag 等列，词形变化、考纲标签自动映射。
            </p>
          </Card>
          <Card>
            <span className="grid size-9 place-items-center rounded-lg bg-amber-700/15 text-amber-900">
              <ListOrdered className="size-4" />
            </span>
            <div className="t-h-16 mt-3">纯单词列表</div>
            <p className="t-label-13 mt-1.5 text-gray-800">
              数组、NDJSON、或按「单词 → 内容」映射的对象都可以；后续可用「词典检索」批量补全释义。
            </p>
          </Card>
          <Card>
            <span className="grid size-9 place-items-center rounded-lg bg-purple-700/10 text-purple-700">
              <Sparkles className="size-4" />
            </span>
            <div className="t-h-16 mt-3">AI 生成词表</div>
            <p className="t-label-13 mt-1.5 text-gray-800">
              让 AI 按 WulonVocab Skill 规范输出 JSON，导入后直接进入导出流程。
            </p>
            <Button variant="tertiary" size="sm" className="mt-2" onClick={() => router.push("/skill")}>
              查看 AI Skill
            </Button>
          </Card>
        </div>

        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={() => setOpen(true)}>
            <Upload className="size-4" /> 选择文件开始导入
          </Button>
        </div>

        <p className="t-label-12 text-center text-gray-700">
          提示：导入是本地解析，文件不会上传到任何服务器。
        </p>
      </main>

      <ImportDialog
        open={open}
        onOpenChange={setOpen}
        onImported={(id) => {
          router.push(`/book/${id}`);
        }}
      />
    </div>
  );
}
