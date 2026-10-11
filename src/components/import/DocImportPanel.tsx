"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileScan, Loader2 } from "lucide-react";
import { buildImportResult, parseImportText } from "@/lib/importer";
import { blobToDataUrl, compressImageWithMeta, extractDocx, extractPdf, type ExtractOutcome } from "@/lib/import/extract";
import { extractJsonText } from "@/lib/lookup/ai";
import { estimateVisionTokens, transcribeImageToWulon } from "@/lib/ai/vision";
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
  const [scanRetry, setScanRetry] = useState<{
    outcome: ExtractOutcome;
    baseName: string;
    scanJson: string[];
    failed: { index: number; blob: Blob; total: number }[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

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

  const describeVisionError = (msg: string): string => {
    if (/401|unauthorized|auth/i.test(msg)) return `${msg}（到设置里检查 AI Key）`;
    if (/429/.test(msg)) return `${msg}（限流或额度不足，稍后再试）`;
    return msg;
  };

  const transcribe = async (blob: Blob, label: string, signal?: AbortSignal) => {
    const cfg = requireVision();
    const small = await compressImageWithMeta(blob);
    const dataUrl = await blobToDataUrl(small.blob);
    setBusy(`视觉转写中：${label}（约 ${estimateVisionTokens(small.width, small.height)} token）…`);
    const content = await transcribeImageToWulon(cfg, dataUrl, currentSchema(), {
      language: aiSource?.config.language,
      pageLabel: label,
      signal,
    });
    return extractJsonText(content);
  };

  /** 文本层与扫描页结果合并为统一种子（wulonvocab JSON）；返回合并后的词条数 */
  const mergeOutcome = (outcome: ExtractOutcome, scanJsonTexts: string[], name: string): { text: string; count: number } => {
    const text = outcome.text.trim();
    if (!scanJsonTexts.length) return { text, count: -1 }; // -1：无扫描页，沿用文本自身判空
    const parts: unknown[] = [];
    const pushEntries = (raw: string, fname: string) => {
      if (!raw.trim()) return;
      const parsed = parseImportText(raw, fname);
      if (parsed.kind === "unknown" || !parsed.rows.length) return;
      const result = buildImportResult(parsed, {});
      for (const e of result.entries) {
        parts.push({ headword: e.headword, tags: e.tags, values: e.values });
      }
    };
    pushEntries(text, name);
    scanJsonTexts.forEach((t, i) => pushEntries(t, `scan-${i + 1}.json`));
    return { text: JSON.stringify({ format: "wulonvocab", version: 1, entries: parts }), count: parts.length };
  };

  const seedAndOpen = (outcome: ExtractOutcome, scanJson: string[], baseName: string, skipped: number) => {
    const merged = mergeOutcome(outcome, scanJson, `${baseName || "文档"}.csv`);
    if (merged.count === 0) {
      throw new Error("扫描页未能转写出词条，请换更清晰的照片，或先跳过失败页");
    }
    if (merged.count < 0 && !merged.text.trim()) {
      throw new Error("没有提取到可识别的文本（扫描版 PDF 请改用拍照导入）");
    }
    onSeeded({ name: `${baseName || "文档"}.json`, text: merged.text });
    toast.success("解析完成，检查预览后导入", {
      description:
        skipped > 0
          ? `有 ${skipped} 页转写失败已跳过；可稍后重试后再次导入`
          : outcome.warnings.length
            ? outcome.warnings[0]
            : undefined,
    });
    setScanRetry(null);
  };

  /** 转写全部扫描页；逐页隔离失败，返回成功 json 与失败清单 */
  const transcribeScans = async (outcome: ExtractOutcome, signal?: AbortSignal) => {
    const scanJson: (string | null)[] = [];
    const failed: { index: number; blob: Blob; total: number }[] = [];
    for (let i = 0; i < outcome.images.length; i += 1) {
      if (signal?.aborted) break;
      try {
        const raw = await transcribe(outcome.images[i], `扫描第 ${i + 1} 页`, signal);
        scanJson.push(raw);
      } catch (e) {
        if (signal?.aborted) break;
        scanJson.push(null);
        failed.push({ index: i, blob: outcome.images[i], total: outcome.images.length });
        // 首错给出可行动提示（Key / 限流），不打断其余页
        if (failed.length === 1) toast.warning(`第 ${i + 1} 页转写失败`, { description: describeVisionError((e as Error).message) });
      }
    }
    return { scanJson, failed };
  };

  const handleFile = async (file: File) => {
    const baseName = file.name.replace(/\.(docx|pdf)$/i, "");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      setScanRetry(null);
      setBusy("正在解析…");
      setProgress(0);
      let outcome: ExtractOutcome;
      if (/\.docx$/i.test(file.name)) {
        outcome = await extractDocx(file);
      } else if (/\.pdf$/i.test(file.name)) {
        outcome = await extractPdf(
          file,
          (p, t) => {
            setProgress(t ? p / t : 0);
            setBusy(`解析 PDF：${p}/${t} 页…`);
          },
          controller.signal,
        );
      } else if (file.type.startsWith("image/")) {
        const raw = await transcribe(file, "照片", controller.signal);
        onSeeded({ name: `${baseName || "照片词表"}.json`, text: raw });
        toast.success("已转写成词表，检查预览后导入");
        return;
      } else {
        throw new Error("支持 .docx / .pdf / 图片（jpg / png / webp）");
      }

      const { scanJson, failed } = await transcribeScans(outcome, controller.signal);
      const okJson = scanJson.filter((t): t is string => Boolean(t));
      if (failed.length) {
        // 有失败页：不直接进导入，先让用户重试或跳过
        setScanRetry({ outcome, baseName, scanJson: okJson, failed });
        toast.warning(`有 ${failed.length}/${outcome.images.length} 页转写失败`, {
          description: "可在下方重试失败页，或跳过它们继续导入",
        });
        return;
      }
      seedAndOpen(outcome, okJson, baseName, 0);
    } catch (e) {
      if (controller.signal.aborted) {
        toast.info("已取消");
      } else {
        toast.error(`导入失败：${(e as Error).message}`);
      }
    } finally {
      setBusy(null);
      setProgress(0);
      controllerRef.current = null;
    }
  };

  const retryFailed = async () => {
    if (!scanRetry) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const { outcome, baseName } = scanRetry;
    const stillFailed: { index: number; blob: Blob; total: number }[] = [];
    const okJson = [...scanRetry.scanJson];
    try {
      setBusy("重试失败页…");
      for (const f of scanRetry.failed) {
        if (controller.signal.aborted) {
          stillFailed.push(f);
          continue;
        }
        try {
          const raw = await transcribe(f.blob, `扫描第 ${f.index + 1} 页`, controller.signal);
          okJson.push(raw);
        } catch (e) {
          stillFailed.push(f);
          toast.warning(`第 ${f.index + 1} 页仍未成功`, { description: describeVisionError((e as Error).message) });
        }
      }
      if (stillFailed.length) {
        setScanRetry({ ...scanRetry, scanJson: okJson, failed: stillFailed });
      } else {
        seedAndOpen(outcome, okJson, baseName, 0);
      }
    } catch (e) {
      toast.error(`重试失败：${(e as Error).message}`);
    } finally {
      setBusy(null);
      controllerRef.current = null;
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
        {busy ? (
          <Button variant="tertiary" size="sm" onClick={() => controllerRef.current?.abort()}>
            取消
          </Button>
        ) : null}
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
      {scanRetry ? (
        <div className="space-y-2 rounded-lg bg-amber-700/10 p-3">
          <div className="t-label-13 text-amber-900">
            {scanRetry.failed.length} 页转写失败（该文档共 {scanRetry.outcome.images.length} 页扫描件）——可重试，或跳过失败页继续。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={Boolean(busy)} onClick={() => void retryFailed()}>
              重试失败页
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                try {
                  seedAndOpen(scanRetry.outcome, scanRetry.scanJson, scanRetry.baseName, scanRetry.failed.length);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              跳过失败页继续
            </Button>
          </div>
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
