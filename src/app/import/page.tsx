"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { AiGeneratePanel } from "@/components/import/AiGeneratePanel";
import { ImportDialog } from "@/components/import/ImportDialog";
import { TextImportPanel } from "@/components/import/TextImportPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

export default function ImportPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const goBook = (id: string) => router.push(`/book?id=${id}`);
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:py-10">
        <div>
          <h1 className="t-h-24">导入词表</h1>
          <p className="t-copy-14 mt-2 text-gray-900">
            文件里有什么字段，就排什么字段：缺结构就自动推断，格式不标准也尽力读懂——导入，就是排版。
          </p>
        </div>

        {/* 粘贴单词列表（最常用路径） */}
        <TextImportPanel onImported={goBook} />

        {/* 文件导入 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="flex flex-col">
            <span className="grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-900">
              <FileJson className="size-4" />
            </span>
            <div className="t-h-16 mt-3">WulonVocab JSON</div>
            <p className="t-label-13 mt-1.5 flex-1 text-gray-800">
              标准格式：{"{ wordbook, schema, entries }"}；schema 可省略，导入时自动推断字段结构。词条数组、NDJSON、「单词 → 内容」映射对象也认。
            </p>
            <Button variant="secondary" size="sm" className="mt-3 self-start" onClick={() => setOpen(true)}>
              <Upload className="size-3.5" /> 选择文件
            </Button>
          </Card>
          <Card className="flex flex-col">
            <span className="grid size-9 place-items-center rounded-lg bg-green-800/10 text-green-900">
              <FileSpreadsheet className="size-4" />
            </span>
            <div className="t-h-16 mt-3">ECDICT / OALD / 通用 CSV</div>
            <p className="t-label-13 mt-1.5 flex-1 text-gray-800">
              自动识别 word / phonetic / translation / exchange / tag 等列，词形变化、考纲标签自动映射。
            </p>
            <Button variant="secondary" size="sm" className="mt-3 self-start" onClick={() => setOpen(true)}>
              <Upload className="size-3.5" /> 选择文件
            </Button>
          </Card>
        </div>

        {/* 内置 AI 生成 */}
        <AiGeneratePanel onImported={goBook} />

        <p className="t-label-12 text-center text-gray-700">
          全程本地解析——文件不出这台电脑；词典匹配与 AI 生成仅在启用对应数据源时联网。
        </p>
      </main>

      <ImportDialog
        open={open}
        onOpenChange={setOpen}
        onImported={(id) => {
          router.push(`/book?id=${id}`);
        }}
      />
    </div>
  );
}
