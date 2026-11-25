"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { TopNav } from "@/components/app/TopNav";
import { AiGeneratePanel } from "@/components/import/AiGeneratePanel";
import { DocImportPanel } from "@/components/import/DocImportPanel";
import { ImportDialog } from "@/components/import/ImportDialog";
import { TextImportPanel } from "@/components/import/TextImportPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

export default function ImportPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<{ name: string; text: string } | null>(null);
  const goBook = (id: string) => router.push(`/book?id=${id}`);

  // /import?panel=ai：静态导出下用原生 query，定位并高亮 AI 面板。
  useEffect(() => {
    if (!window.location.search.includes("panel=ai")) return;
    const el = document.getElementById("ai-generate");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const ring = ["rounded-xl", "ring-2", "ring-purple-700/40"];
    el.classList.add(...ring);
    const t = setTimeout(() => el.classList.remove(...ring), 2400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:py-10">
        <div>
          <h1 className="t-h-24">导入词表</h1>
          <p className="t-copy-14 mt-2 max-w-2xl text-gray-900">
            批量粘贴、文档图片、JSON / CSV，或交给 AI 生成。所有入口都先预览，再决定放进哪个词库。
          </p>
        </div>

        <TextImportPanel onImported={goBook} />

        <DocImportPanel
          onSeeded={(s) => {
            setSeed(s);
            setOpen(true);
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="flex flex-col">
            <span className="grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-900">
              <FileJson className="size-4" />
            </span>
            <div className="t-h-16 mt-3">WulonVocab JSON</div>
            <p className="t-label-13 mt-1.5 flex-1 text-gray-800">
              标准格式 {"{ wordbook, schema, entries }"}；schema 可以省略，结构会自动推断。词条数组、NDJSON、「单词 → 内容」字典也认。
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
              音标、释义、词形变化、考纲标签都能自动对上号，从 ECDICT 到随手整理的表格都行。
            </p>
            <Button variant="secondary" size="sm" className="mt-3 self-start" onClick={() => setOpen(true)}>
              <Upload className="size-3.5" /> 选择文件
            </Button>
          </Card>
        </div>

        <div id="ai-generate" className="rounded-xl">
          <AiGeneratePanel onImported={goBook} />
        </div>

        <p className="t-label-12 text-center text-gray-700">
          解析默认在本机完成；只有你主动启用在线词典或 AI 时，才会联网。
        </p>
      </main>

      <ImportDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSeed(null);
        }}
        seed={seed}
        onImported={(id) => {
          router.push(`/book?id=${id}`);
        }}
      />
    </div>
  );
}
