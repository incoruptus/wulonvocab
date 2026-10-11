import { toBlob, toCanvas } from "html-to-image";
import { slugify } from "../utils";

export interface PaperMm {
  width: number;
  height: number;
}

/* ============================================================
   矢量 PDF：隐藏 iframe 克隆 + 动态 @page + print()
   详见调研：Chrome「另存为 PDF」保留矢量文字并自动嵌入字体子集
   ============================================================ */

export async function printPages(pagesRoot: HTMLElement, paper: PaperMm, title: string): Promise<void> {
  await document.fonts.ready;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>";
  });
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("无法创建打印框架");
  }

  for (const node of Array.from(document.querySelectorAll<HTMLElement>('style, link[rel~="stylesheet"]'))) {
    if (node.tagName === "STYLE") {
      const style = doc.createElement("style");
      try {
        const sheet = (node as HTMLStyleElement).sheet;
        style.textContent = sheet
          ? Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join("\n")
          : node.textContent ?? "";
      } catch {
        style.textContent = node.textContent ?? "";
      }
      doc.head.appendChild(style);
    } else if ((node as HTMLLinkElement).href) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(link);
    }
  }

  const pageStyle = doc.createElement("style");
  pageStyle.textContent = [
    `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`,
    "html, body { margin: 0; padding: 0; background: #fff; }",
    "* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
  ].join("\n");
  doc.head.appendChild(pageStyle);

  doc.body.appendChild(pagesRoot.cloneNode(true));

  await Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
  try {
    await doc.fonts.ready;
  } catch {
    /* ignore */
  }

  const prevTitle = document.title;
  document.title = title;
  doc.title = title;
  win.focus();
  win.print();

  const cleanup = () => {
    document.title = prevTitle;
    frame.remove();
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);
}

/* ============================================================
   PNG / 图片型 PDF 导出
   ============================================================ */

export interface CaptureOptions {
  pixelRatio?: number;
  backgroundColor?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * 字体内联（PNG / 图片型 PDF 专用）：
 * 自托管 CJK 字体按 unicode-range 拆成数百个分片，html-to-image 默认会把**全部** @font-face
 * 资源 base64 内联进每页 SVG（600+ 个文件、几十 MB），内存直接爆炸崩掉标签页。
 * 这里改为：只内联「本页实际加载过」的字形分片（通常 5~10 个，几百 KB）——
 * 未加载的分片 = 页面上不存在的字形，不嵌也不影响渲染。
 */
async function loadedFontEmbedCss(): Promise<string> {
  if (typeof document === "undefined") return "";
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  const loaded = new Set<string>();
  for (const entry of performance.getEntriesByType("resource")) {
    if (/\.woff2?(\?|$)/.test(entry.name)) loaded.add(entry.name.split("?")[0]);
  }
  if (!loaded.size) return "";

  const dataCache = new Map<string, Promise<string>>();
  const inline = (url: string): Promise<string> => {
    const cached = dataCache.get(url);
    if (cached) return cached;
    const task = (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`字体分片读取失败（HTTP ${res.status}）`);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      return `data:font/woff2;base64,${btoa(bin)}`;
    })();
    dataCache.set(url, task);
    return task;
  };

  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? document.baseURI;
    for (const rule of Array.from(cssRules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const style = (rule as CSSFontFaceRule).style;
      const src = style.getPropertyValue("src");
      if (!src) continue;
      const urls = [...src.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)]
        .map((m) => m[1])
        .filter((u) => {
          try {
            return loaded.has(new URL(u, base).href.split("?")[0]);
          } catch {
            return false; // 畸形 url 只跳过该条，不使整次内联降级
          }
        });
      if (!urls.length) continue;
      const sources: string[] = [];
      for (const u of urls) {
        try {
          sources.push(`url("${await inline(new URL(u, base).href)}") format("woff2")`);
        } catch {
          /* 单个分片失败则跳过（该字形回退系统字体） */
        }
      }
      if (!sources.length) continue;
      const family = style.getPropertyValue("font-family");
      const weight = style.getPropertyValue("font-weight") || "400";
      const fontStyle = style.getPropertyValue("font-style") || "normal";
      const unicodeRange = style.getPropertyValue("unicode-range");
      rules.push(
        `@font-face{font-family:${family};font-style:${fontStyle};font-weight:${weight};font-display:swap;src:${sources.join(",")};${
          unicodeRange ? `unicode-range:${unicodeRange};` : ""
        }}`,
      );
    }
  }
  return rules.length ? rules.join("\n") : "";
}

/**
 * 每次导出重建（已加载分片集合会随页面使用而增长，不做跨导出缓存）。
 * 注意：约定「空」必须返回 "" 而非 undefined —— html-to-image 对 fontEmbedCSS 为 null/undefined
 * 时会回退到 getFontEmbedCSS() 全量内联（内存爆炸路径，见 AGENTS 硬约束 8）。
 */
async function sharedFontCss(): Promise<string> {
  try {
    return await loadedFontEmbedCss();
  } catch {
    return "";
  }
}

export async function capturePagesAsPng(pages: HTMLElement[], options: CaptureOptions = {}): Promise<Blob[]> {
  const { pixelRatio = 3.125, backgroundColor = "#ffffff", onProgress } = options;
  const fontEmbedCSS = await sharedFontCss();
  const blobs: Blob[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const blob = await toBlob(pages[i], {
      pixelRatio,
      backgroundColor,
      cacheBust: true,
      fontEmbedCSS,
    });
    if (blob) blobs.push(blob);
    onProgress?.(i + 1, pages.length);
  }
  return blobs;
}

export interface RasterPdfOptions extends CaptureOptions {
  quality?: number;
}

export async function exportRasterPdf(pages: HTMLElement[], paper: PaperMm, options: RasterPdfOptions = {}): Promise<Blob> {
  const { pixelRatio = 2.5, quality = 0.92, backgroundColor = "#ffffff", onProgress } = options;
  const fontEmbedCSS = await sharedFontCss();
  const { jsPDF } = await import("jspdf");
  const orientation = paper.width > paper.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: [paper.width, paper.height], compress: true });

  for (let i = 0; i < pages.length; i += 1) {
    // 走 canvas → JPEG 字节流直传，避免 base64 dataURL 的内存翻倍（大文档下会压垮标签页）
    const canvas = await toCanvas(pages[i], {
      pixelRatio,
      backgroundColor,
      cacheBust: true,
      fontEmbedCSS,
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("页面画布导出失败"))), "image/jpeg", quality);
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (i > 0) pdf.addPage([paper.width, paper.height], orientation);
    pdf.addImage(bytes, "JPEG", 0, 0, paper.width, paper.height, undefined, "FAST");
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(i + 1, pages.length);
    // 让出事件循环：给浏览器回收上一页画布内存的机会（大词库导出更稳）
    await new Promise((r) => setTimeout(r, 0));
  }
  return pdf.output("blob");
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return zip.generateAsync({ type: "blob" });
}

export function exportBaseName(bookName: string, paperName: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${slugify(bookName)}-${paperName}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function dpiLabel(pixelRatio: number): string {
  return `${Math.round(96 * pixelRatio)} DPI`;
}
