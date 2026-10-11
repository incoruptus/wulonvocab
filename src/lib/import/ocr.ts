/**
 * 本机 OCR（tesseract.js）——免 AI 的扫描件 / 照片识别
 * ------------------------------------------------------------
 * - worker 会话级复用（每页新建 worker 太贵）；中止时终止重置，下次自动重建；
 * - worker / wasm / 语言数据走 tesseract.js 默认 CDN 加载（首次识别需联网下载 eng 语言包）；
 * - 产物是「单词 tokens」而非整篇文本：清噪、小写化、按出现顺序去重（词表扫描场景）。
 */

export interface OcrProgress {
  status: string;
  progress: number;
}

type TesseractWorker = import("tesseract.js").Worker;

let workerPromise: Promise<TesseractWorker> | null = null;
let progressSink: ((p: OcrProgress) => void) | null = null;

async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<TesseractWorker> {
  progressSink = onProgress ?? progressSink;
  if (!workerPromise) {
    const p = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        logger: (m: { status?: string; progress?: number }) => {
          progressSink?.({ status: m.status ?? "", progress: m.progress ?? 0 });
        },
      });
    })();
    p.catch(() => {
      if (workerPromise === p) workerPromise = null; // 创建失败：允许重试
    });
    workerPromise = p;
  }
  return workerPromise;
}

/** 中止/异常后释放共享 worker（下次识别自动重建） */
function resetWorker(): void {
  const p = workerPromise;
  workerPromise = null;
  progressSink = null;
  void p?.then((w) => w.terminate()).catch(() => undefined);
}

/** 提取单词 tokens（纯函数 · 单测覆盖）：字母开头、≥2 字符、小写化、按出现顺序去重、封顶 */
export function extractWordTokens(text: string, cap = 300): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/[A-Za-z][A-Za-z'’-]{1,29}/g) ?? [];
    for (const w of matches) {
      const norm = w.toLowerCase();
      if (norm.length < 2 || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/** 识别一张图片 → 单词 tokens；支持取消（中止即终止 worker） */
export async function ocrImageToWords(
  blob: Blob,
  opts: { onProgress?: (p: OcrProgress) => void; signal?: AbortSignal } = {},
): Promise<string[]> {
  if (opts.signal?.aborted) throw new Error("已取消");
  let worker: TesseractWorker;
  try {
    worker = await getWorker(opts.onProgress);
  } catch (e) {
    throw new Error(`本机识别组件加载失败（需联网下载一次）：${(e as Error).message}`);
  }
  const onAbort = () => resetWorker();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const { data } = await worker.recognize(blob);
    if (opts.signal?.aborted) throw new Error("已取消");
    return extractWordTokens(data.text ?? "");
  } catch (e) {
    if (opts.signal?.aborted) {
      resetWorker();
      throw new Error("已取消");
    }
    throw e;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
