import { assetPath } from "../paths";

/**
 * 文档 / 图片抽取（本地优先，AI 兜底）
 * ------------------------------------------------------------
 * .docx → mammoth 提取（表格 → CSV 行，纯前端零成本）；
 * .pdf  → pdfjs-dist 文本层逐页提取；扫描页（文本过少）渲染为图片，交视觉模型转写；
 * 图片  → 压缩至长边 1600px，供视觉模型使用。
 * 产物文本一律汇入 parseImportText 走既有导入管线。
 */

export interface ExtractOutcome {
  text: string;
  /** 需要视觉模型转写的页面图片（扫描页 / 照片） */
  images: Blob[];
  pages: number;
  warnings: string[];
  method: "docx" | "pdf" | "image";
}

/* ---------------- .docx ---------------- */

export async function extractDocx(file: File): Promise<ExtractOutcome> {
  const mammoth = await import("mammoth");
  const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const escapeCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const tableLines: string[] = [];
  const paraLines: string[] = [];
  // 只取顶层表格的行与“本行直属”的单元格，避免嵌套表格错列/重复
  const topTables = [...doc.querySelectorAll("table")].filter((t) => !t.parentElement?.closest("table"));
  for (const table of topTables) {
    for (const tr of [...table.querySelectorAll("tr")]) {
      // 行可能属于内层表格：只保留其最近 table 祖先等于当前表的行
      if (tr.closest("table") !== table) continue;
      const cells = [...tr.children]
        .filter((c) => c.tagName === "TD" || c.tagName === "TH")
        .map((c) => {
          const paras = [...c.querySelectorAll("p")].map((p) => (p.textContent ?? "").trim()).filter(Boolean);
          return (paras.length ? paras.join(" ") : (c.textContent ?? "").trim());
        });
      if (cells.some(Boolean)) tableLines.push(cells.map(escapeCell).join(","));
    }
  }
  doc.querySelectorAll("p").forEach((p) => {
    if (p.closest("table")) return; // 表格单元格内的段落已并入 CSV 行
    const text = (p.textContent ?? "").trim();
    if (text) paraLines.push(text);
  });
  // 有表格时只用表格行（标题/说明段落不混入数据）；无表格时才用段落
  const lines = tableLines.length ? tableLines : paraLines;
  const warnings = messages
    .filter((m) => m.type === "warning")
    .slice(0, 3)
    .map((m) => m.message);
  return { text: lines.join("\n"), images: [], pages: 1, warnings, method: "docx" };
}

/* ---------------- .pdf ---------------- */

let workerConfigured = false;

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = assetPath("pdfjs/pdf.worker.min.mjs");
    workerConfigured = true;
  }
  return pdfjs;
}

export async function extractPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ExtractOutcome> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: assetPath("pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: assetPath("pdfjs/standard_fonts/"),
    wasmUrl: assetPath("pdfjs/wasm/"),
  });
  let doc: Awaited<typeof task.promise> | null = null;
  const lines: string[] = [];
  const images: Blob[] = [];
  const warnings: string[] = [];
  try {
    // 加载失败（损坏/加密）也保证走到 finally 释放 worker
    try {
      doc = await task.promise;
    } catch (e) {
      const name = (e as { name?: string }).name ?? "";
      if (name === "PasswordException") {
        throw new Error("这个 PDF 有密码保护，暂不支持；可先用阅读器去除密码后再导入");
      }
      throw new Error("PDF 无法打开（文件可能损坏或格式异常）");
    }
    if (doc.numPages > 200) {
      throw new Error(`PDF 共 ${doc.numPages} 页，超出单次导入上限（200 页）；请拆分后再试`);
    }
    for (let p = 1; p <= doc.numPages; p += 1) {
      if (signal?.aborted) break;
      const page = await doc.getPage(p);
      try {
        const textContent = await page.getTextContent();
        const items = (textContent.items as { str?: unknown; transform?: unknown; height?: unknown }[])
          .filter((it): it is { str: string; transform: number[]; height: number } =>
            typeof it.str === "string" && it.str.length > 0 && Array.isArray(it.transform),
          )
          .map((it) => ({ str: it.str, transform: it.transform, height: typeof it.height === "number" ? it.height : 10 }));
        const chars = items.reduce((n, it) => n + it.str.replace(/\s/g, "").length, 0);

        if (chars < 50) {
          // 扫描 / 低文本页 → 渲染为图交给视觉模型
          const viewport = page.getViewport({ scale: 150 / 72 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvas, viewport }).promise;
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
            if (blob) {
              images.push(blob);
              warnings.push(`第 ${p} 页几乎没有文本层（疑似扫描件），已转为图片待视觉转写`);
            }
          }
          canvas.width = 0;
          canvas.height = 0;
        } else {
          // 行聚类：y 容差 = 中位字高 × 0.6，组内按 x 排序
          const heights = items.map((it) => it.height).sort((a, b) => a - b);
          const tol = Math.max(4, (heights[Math.floor(heights.length / 2)] ?? 10) * 0.6);
          const rows = new Map<number, { x: number; str: string }[]>();
          for (const it of items) {
            const key = Math.round((it.transform[5] ?? 0) / tol);
            const bucket = rows.get(key);
            if (bucket) bucket.push({ x: it.transform[4] ?? 0, str: it.str });
            else rows.set(key, [{ x: it.transform[4] ?? 0, str: it.str }]);
          }
          const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]); // PDF 的 y 轴向上
          for (const [, cells] of sorted) {
            const line = cells
              .sort((a, b) => a.x - b.x)
              .map((c) => c.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (line) lines.push(line);
          }
          lines.push("");
        }
      } finally {
        page.cleanup();
      }
      onProgress?.(p, doc.numPages);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    void task.destroy();
  }
  return { text: lines.join("\n"), images, pages: doc?.numPages ?? 0, warnings, method: "pdf" };
}

/* ---------------- 图片 ---------------- */

/** 快速判定 HEIC/HEIF：扩展名、MIME，或 ISO-BMFF 的 ftyp 魔数（iPhone 照片常见） */
export async function looksHeic(file: File | Blob): Promise<boolean> {
  if (typeof File !== "undefined" && file instanceof File && /\.(heic|heif)$/i.test(file.name)) return true;
  const type = (file.type || "").toLowerCase();
  if (type.includes("heic") || type.includes("heif")) return true;
  if (file.size < 12) return false;
  const head = new Uint8Array(await file.slice(4, 12).arrayBuffer());
  return /^ftyp(heic|heix|hevc|hevx|mif1|msf1)/.test(String.fromCharCode(...head));
}

/**
 * HEIC/HEIF → JPEG：浏览器 createImageBitmap 普遍不认 HEIC，走 heic-to 的 wasm 解码
 * （动态 import，仅遇到 HEIC 时才加载）。非 HEIC 原样返回；解码失败回退原图，
 * 交给后续 createImageBitmap 给出统一报错。
 */
export async function normalizeImageFile(file: File | Blob): Promise<File | Blob> {
  if (!(await looksHeic(file))) return file;
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  } catch {
    return file;
  }
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 压缩到长边 1600px（webp 0.8，失败回退 jpeg）；EXIF 方向自动校正；HEIC 先转 JPEG */
export async function compressImageWithMeta(file: File | Blob, maxEdge = 1600, quality = 0.8): Promise<CompressedImage> {
  const src = await normalizeImageFile(file);
  const bitmap = await createImageBitmap(src, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布不可用");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), type, quality));
  const out = (await toBlob("image/webp")) ?? (await toBlob("image/jpeg"));
  canvas.width = 0;
  canvas.height = 0;
  if (!out) throw new Error("图片压缩失败");
  return { blob: out, width: w, height: h };
}

export async function compressImage(file: File | Blob, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  return (await compressImageWithMeta(file, maxEdge, quality)).blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}
