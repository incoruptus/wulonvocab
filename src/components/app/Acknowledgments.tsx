"use client";

import { Dialog, DialogBody, DialogHeader } from "@/components/ui/overlay";

/**
 * 鸣谢与技术栈：列出全部开源依赖、字体与数据来源（附许可）。
 * 口径：仅收录免费 / 开源许可资源；示例与文档内容均为自撰，不含词典原文。
 */

interface AckItem {
  name: string;
  note?: string;
}

const SECTIONS: { title: string; items: AckItem[] }[] = [
  {
    title: "平台与框架",
    items: [
      { name: "Next.js", note: "MIT" },
      { name: "React", note: "MIT" },
      { name: "TypeScript", note: "Apache-2.0" },
      { name: "Tailwind CSS", note: "MIT" },
      { name: "Geist 设计系统", note: "Vercel" },
    ],
  },
  {
    title: "界面组件",
    items: [
      { name: "Radix UI", note: "MIT" },
      { name: "lucide-react", note: "ISC" },
      { name: "sonner", note: "MIT" },
      { name: "dnd-kit", note: "MIT" },
      { name: "class-variance-authority / clsx / tailwind-merge", note: "Apache-2.0 / MIT / MIT" },
    ],
  },
  {
    title: "状态与存储",
    items: [
      { name: "Zustand", note: "MIT" },
      { name: "idb-keyval", note: "Apache-2.0" },
      { name: "zod", note: "MIT" },
    ],
  },
  {
    title: "学习引擎",
    items: [{ name: "ts-fsrs", note: "MIT，实现 FSRS 间隔重复算法" }],
  },
  {
    title: "导入与解析",
    items: [
      { name: "mammoth（.docx 解析）", note: "BSD-2-Clause" },
      { name: "pdf.js（PDF 文本与渲染）", note: "Apache-2.0" },
      { name: "PapaParse（CSV）", note: "MIT" },
      { name: "JSZip", note: "MIT" },
    ],
  },
  {
    title: "导出与印刷",
    items: [
      { name: "jsPDF", note: "MIT" },
      { name: "html-to-image", note: "MIT" },
    ],
  },
  {
    title: "图像与识别",
    items: [
      { name: "heic-to（HEIC 解码）", note: "LGPL-3.0" },
      { name: "tesseract.js（本机 OCR）", note: "Apache-2.0" },
    ],
  },
  {
    title: "跨端同步",
    items: [
      { name: "PeerJS（面对面直传）", note: "MIT" },
      { name: "GitHub Gist API", note: "可选自动同步" },
    ],
  },
  {
    title: "二维码",
    items: [
      { name: "qrcode", note: "MIT" },
      { name: "jsQR", note: "Apache-2.0" },
    ],
  },
  {
    title: "字体",
    items: [
      { name: "Geist", note: "SIL OFL 1.1" },
      { name: "思源宋体 Noto Serif SC", note: "SIL OFL 1.1" },
      { name: "HarmonyOS Sans SC", note: "华为免费商用许可" },
    ],
  },
  {
    title: "词典数据",
    items: [
      { name: "ECDICT（skywind3000）", note: "MIT，提供词频与考纲标记" },
      { name: "dictionaryapi.dev", note: "可选在线兜底" },
    ],
  },
];

export function AcknowledgmentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="鸣谢与技术栈" desc="这些开源项目与开放资源，让 WulonVocab 得以安静地工作。" />
      <DialogBody className="scroll-thin max-h-[62dvh] space-y-4 overflow-y-auto">
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="t-label-13 font-medium text-gray-1000">{sec.title}</div>
            <ul className="mt-1 space-y-0.5">
              {sec.items.map((it) => (
                <li key={it.name} className="t-label-12 text-gray-700">
                  <span className="text-gray-900">{it.name}</span>
                  {it.note ? ` · ${it.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="t-label-12 border-t border-gray-300 pt-3 text-gray-700">
          内置示例与文档内容均为自撰，不含受版权保护的词典原文。以上皆使用免费或开源许可；若有遗漏或标注不当，欢迎到项目主页指出。
        </p>
      </DialogBody>
    </Dialog>
  );
}
