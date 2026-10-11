import { assetPath } from "../paths";

/**
 * 内置词典（一键离线）
 * ------------------------------------------------------------
 * 数据：ECDICT 基础版子集（词频 BNC∪COCA 前 N ∪ 考纲标注词），由
 * `scripts/build-ecdict-subset.mjs` 从 ecdict.csv 生成；MIT 许可（随附 LICENSE）。
 * 产物在 public/dicts/*.csv.gz，经 assetPath() 引用（兼容 basePath 部署）。
 */

export interface BuiltinDict {
  id: string;
  name: string;
  file: string;
  words: number;
  gzipBytes: number;
  note: string;
}

export const BUILTIN_DICTS: BuiltinDict[] = [
  {
    id: "ecdict-20k",
    name: "ECDICT 精要",
    file: "/dicts/ecdict-20k.csv.gz",
    words: 27861,
    gzipBytes: 2516000,
    note: "词频前 2 万 + 考纲词 · 覆盖日常与考试常用",
  },
  {
    id: "ecdict-50k",
    name: "ECDICT 标准",
    file: "/dicts/ecdict-50k.csv.gz",
    words: 59137,
    gzipBytes: 4418000,
    note: "词频前 5 万 + 考纲词 · 接近完整覆盖",
  },
];

/**
 * 下载并解压内置词典（gzip），返回 CSV 文本。
 * 下载阶段提供进度回调（content-length 可得时）。
 */
export async function downloadBuiltinDict(
  dict: BuiltinDict,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("超时")), 60000);
  let res: Response;
  try {
    res = await fetch(assetPath(dict.file), { signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).message === "超时") throw new Error("下载超时（60s）——检查网络后重试");
    throw e;
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  const total = Number(res.headers.get("content-length")) || dict.gzipBytes;
  let received = 0;
  let body: ReadableStream<Uint8Array>;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress?.(total ? Math.min(1, received / total) : 0);
      }
    }
    body = new Blob(chunks as BlobPart[]).stream() as ReadableStream<Uint8Array>;
  } else {
    body = (await res.blob()).stream() as ReadableStream<Uint8Array>;
    onProgress?.(1);
  }
  // TS 的 DOM 类型对 DecompressionStream 的 pipeThrough 泛型不完全匹配（已知缝隙），此处收窄
  const decompressed = body.pipeThrough(
    new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>,
  );
  const text = await new Response(decompressed).text();
  clearTimeout(timer);
  return text;
}
