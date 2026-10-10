// 将 pdfjs-dist 的运行时资源同步到 public/pdfjs/（构建前自动执行，gitignore 不提交）。
//
// 背景：Next 静态导出 + GB Pages 子路径下，worker/cmaps/标准字体/wasm 交给 bundler 解析最易出错，
// 一律走 public 直出 + assetPath() 引用；升级 pdfjs-dist 时本脚本自动带上同版本资源（三件套同步）。
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.error(`[sync-pdfjs] 未找到 ${src}，请先执行 npm install`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

copyFileSync(join(src, "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  const from = join(src, dir);
  if (existsSync(from)) cpSync(from, join(dest, dir), { recursive: true });
}

console.log("[sync-pdfjs] pdfjs-dist → public/pdfjs（worker + cmaps + standard_fonts + wasm）");
