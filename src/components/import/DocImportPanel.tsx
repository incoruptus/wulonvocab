"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileScan, Loader2 } from "lucide-react";
import { buildImportResult, parseImportText } from "@/lib/importer";
import { blobToDataUrl, compressImage, extractDocx, extractPdf, type ExtractOutcome } from "@/lib/import/extract";
import { extractJsonText } from "@/lib/lookup/ai";
import { transcribeImageToWulon } from "@/lib/ai/vision";
import { defaultSchema } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

/**
 * 从文档 / 图片导入：
 * .docx → mammoth 本地提取（零成本）；.pdf → 文本层本地提取，扫描页转视觉模型；
 * 图片 → 压缩后交视觉模型转写。产物统一预置进 ImportDialog 预览再入库。
 */
export function DocImportPanel({ onSeeded }: { onSeeded: (seed: { name: string; text: string }) => void }) {
  const sources = useAppStore((s) => s.lookupSources);
  const books = useAppStore((s) => s.books);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const aiSource = sources.find((s) => s.kind === "ai" && s.enabled) ?? sources.find((s) => s.kind === "ai");
  const visionCfg = aiSource
    ? {
        baseUrl: aiSource.config.baseUrl ?? "",
        apiKey: aiSource.config.apiKey,
        model: (aiSource.config.visionModel || aiSource.config.model || "").trim(),
      }
    : null;
  /** 视觉转写用的 schema：只能在事件处理器里构造（uid 走 crypto.randomUUID，预渲染会报错） */
  const currentSchema = () => books[0]?.schema ?? defaultSchema();

  const requireVision = () => {
    if (!visionCfg?.baseUrl || !visionCfg.model) {
      throw new Error("照片 / 扫描件需要视觉模型：请到「设置 → 词典数据源 → AI」配置服务商与「视觉模型」");
    }
    return visionCfg;
  };

  const transcribe = async (blob: Blob, label: string) => {
    const cfg = requireVision();
    const small = await compressImage(blob);
    const dataUrl = await blobToDataUrl(small);
    setBusy(`视觉转写中：${label}…`);
    const content = await transcribeImageToWulon(cfg, dataUrl, currentSchema(), {
      language: aiSource?.config.language,
      pageLabel: label,
    });
    return extractJsonText(content);
  };

  /** 文本层与扫描页结果合并为统一种子（wulonvocab JSON） */
  const mergeOutcome = (outcome: ExtractOutcome, scanJsonTexts: string[], name: string): string => {
    const text = outcome.text.trim();
    if (!scanJsonTexts.length) return text;
    const parts: unknown[] = [];
    const pushEntries = (raw: string, fname: string) => {
      if (!raw.trim()) return;
      const parsed = parseImportText(raw, fname);
      if (parsed.kind === "unknown" || !parsed.rows.length) return;
      const result = buildImportResult(parsed, {});
      for (const e of result.entries) {
        parts.push({
          headword: e.headword,
          tags: e.tags,
          values: e.values,
        });
      }
    };
    pushEntries(text, name);
    scanJsonTexts.forEach((t, i) => pushEntries(t, `scan-${i + 1}.json`));
    return JSON.stringify({ format: "wulonvocab", version: 1, entries: parts });
  };

  const handleFile = async (file: File) => {
    const baseName = file.name.replace(/\.(docx|pdf)$/i, "");
    try {
      setBusy("正在解析…");
      setProgress(0);
      let outcome: ExtractOutcome;
      if (/\.docx$/i.test(file.name)) {
        outcome = await extractDocx(file);
      } else if (/\.pdf$/i.test(file.name)) {
        outcome = await extractPdf(file, (p, t) => {
          setProgress(t ? p / t : 0);
          setBusy(`解析 PDF：${p}/${t} 页…`);
        });
      } else if (file.type.startsWith("image/")) {
        const raw = await transcribe(file, "照片");
        onSeeded({ name: `${baseName || "照片词表"}.json`, text: raw });
        toast.success("已转写成词表，检查预览后导入");
        return;
      } else {
        throw new Error("支持 .docx / .pdf / 图片（jpg / png / webp）");
      }

      const scanJson: string[] = [];
      for (let i = 0; i < outcome.images.length; i += 1) {
        const raw = await transcribe(outcome.images[i], `扫描第 ${i + 1} 页`);
        scanJson.push(raw);
      }
      const text = mergeOutcome(outcome, scanJson, `${baseName || "文档"}.csv`);
      if (!text.trim()) {
        throw new Error(
          outcome.images.length
            ? "扫描页未能转写出词条，请换更清晰的照片"
            : "没有提取到可识别的文本（扫描版 PDF 请改用拍照导入）",
        );
      }
      onSeeded({ name: `${baseName || "文档"}.json`, text });
      toast.success("解析完成，检查预览后导入", {
        description: outcome.warnings.length ? outcome.warnings[0] : undefined,
      });
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`);
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-700/10 text-teal-700">
          <FileScan className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="t-h-16">从文档 / 图片导入</div>
          <p className="t-label-13 mt-0.5 text-gray-800">
            Word 与 PDF 的文本在本机直读、零成本；扫描件和照片交给视觉模型转写——都会先预览再入库。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileScan className="size-3.5" />}
          {busy ?? "选择文件（.docx / .pdf / 图片）"}
        </Button>
        {visionCfg?.baseUrl && visionCfg.model ? (
          <span className="t-label-12 text-gray-700">视觉模型：{visionCfg.model}</span>
        ) : (
          <span className="t-label-12 text-gray-700">照片 / 扫描件需先在设置里配置 AI 的「视觉模型」</span>
        )}
      </div>
      {busy && progress > 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-blue-700 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleFile(file);
          e.target.value = "";
        }}
      />
    </Card>
  );
}
