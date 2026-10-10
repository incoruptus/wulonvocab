#!/usr/bin/env node
/**
 * 构建 GitHub Pages 静态站点：
 *   WV_EXPORT=1 + NEXT_PUBLIC_BASE_PATH（默认 /wulonvocab）→ 输出到 out/
 * 用法：npm run build:pages
 *
 * 后处理：Next 16 静态导出会把「客户端段缓存」payload 写成
 *   <route>/__next.<segment>/__PAGE__.txt
 * 而运行时请求的是
 *   <route>/__next.<segment>.__PAGE__.txt
 * 静态主机（GitHub Pages）无法重写，这里在构建后补一份点号文件。
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const env = {
  ...process.env,
  WV_EXPORT: "1",
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/wulonvocab",
};

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env,
  shell: true,
});

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const outDir = join(process.cwd(), "out");
let patched = 0;

function collectPageFiles(dir, base) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectPageFiles(full, base ? `${base}/${entry}` : entry));
    } else if (entry === "__PAGE__.txt") {
      found.push(base ? `${base}/__PAGE__.txt` : "__PAGE__.txt");
    }
  }
  return found;
}

function patchSegmentPayloads(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("__next.")) {
      // 目录 __next.<a> 下可能有 __PAGE__.txt，或嵌套 __next.<a>/<b>/__PAGE__.txt
      for (const rel of collectPageFiles(full, "")) {
        const stripped = rel === "__PAGE__.txt" ? "" : rel.replace(/\/__PAGE__\.txt$/, "");
        const dotted = stripped.replace(/\//g, ".");
        const target = join(dir, dotted ? `${entry}.${dotted}.__PAGE__.txt` : `${entry}.__PAGE__.txt`);
        if (!existsSync(target)) {
          copyFileSync(join(full, rel), target);
          patched += 1;
        }
      }
    }
    patchSegmentPayloads(full);
  }
}

if (existsSync(outDir)) {
  patchSegmentPayloads(outDir);
  console.log(`✔ 静态站点已生成于 out/（补齐 ${patched} 个段缓存文件）`);
}
