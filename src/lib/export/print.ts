import { getFontEmbedCSS, toBlob, toJpeg } from "html-to-image";
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

async function sharedFontCss(first: HTMLElement | undefined): Promise<string | undefined> {
  if (!first) return undefined;
  try {
    return await getFontEmbedCSS(first);
  } catch {
    return undefined;
  }
}

export async function capturePagesAsPng(pages: HTMLElement[], options: CaptureOptions = {}): Promise<Blob[]> {
  const { pixelRatio = 3.125, backgroundColor = "#ffffff", onProgress } = options;
  const fontEmbedCSS = await sharedFontCss(pages[0]);
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
  const fontEmbedCSS = await sharedFontCss(pages[0]);
  const { jsPDF } = await import("jspdf");
  const orientation = paper.width > paper.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: [paper.width, paper.height], compress: true });

  for (let i = 0; i < pages.length; i += 1) {
    const dataUrl = await toJpeg(pages[i], {
      pixelRatio,
      quality,
      backgroundColor,
      cacheBust: true,
      fontEmbedCSS,
    });
    if (i > 0) pdf.addPage([paper.width, paper.height], orientation);
    pdf.addImage(dataUrl, "JPEG", 0, 0, paper.width, paper.height, undefined, "FAST");
    onProgress?.(i + 1, pages.length);
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
