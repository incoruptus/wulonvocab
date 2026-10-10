// 将 HarmonyOS Sans SC 分片 webfont 从 node_modules 同步到 public/fonts/harmony/。
//
// 背景：
// - 该 npm 包的 exports 映射禁止子路径导入（Turbopack 严格执行，无法 `import .../dist/Regular.css`）；
// - CJK 字体体积大，不应进入 git 仓库（public/fonts/ 已 gitignore，构建产物 out/ 会带上）；
// - 同步后的 CSS 内 url("./X.woff2") 为相对路径，天然兼容 basePath；
//   cn-font-split 的 unicode-range 分片让浏览器只下载页面实际用到的字形分片。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = "harmonyos-sans-sc-webfont-splitted";
const srcDir = join(root, "node_modules", pkg, "dist");
const destDir = join(root, "public", "fonts", "harmony");
const WEIGHTS = ["Regular", "Medium", "Semibold"];

if (!existsSync(srcDir)) {
  console.error(`[sync-fonts] 未找到 ${srcDir}，请先执行 npm install`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const weight of WEIGHTS) {
  const cssName = `${weight}.css`;
  const css = readFileSync(join(srcDir, cssName), "utf8");
  const refs = [...css.matchAll(/url\("\.\/([^"]+\.woff2)"\)/g)].map((m) => m[1]);
  for (const file of refs) {
    copyFileSync(join(srcDir, file), join(destDir, file));
    copied += 1;
  }
  writeFileSync(join(destDir, cssName), css);
}

const license = join(root, "node_modules", pkg, "LICENSE");
if (existsSync(license)) copyFileSync(license, join(destDir, "LICENSE.txt"));

console.log(`[sync-fonts] HarmonyOS Sans SC → public/fonts/harmony（${WEIGHTS.length} 个字重 · ${copied} 个分片）`);
