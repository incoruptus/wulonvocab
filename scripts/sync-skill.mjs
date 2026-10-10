#!/usr/bin/env node
/**
 * 同步 Skill 资源到 public/，供应用内下载：
 *   skill/wulonvocab-json/  →  public/downloads/skill/wulonvocab-json/
 *   examples/example-minimal.json  →  public/samples/sample-import.json
 */

import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcSkill = join(root, "skill", "wulonvocab-json");
const outBase = join(root, "public", "downloads", "skill");
const outSkill = join(outBase, "wulonvocab-json");

if (!existsSync(srcSkill)) {
  console.error("未找到 skill/wulonvocab-json 目录");
  process.exit(1);
}

rmSync(outSkill, { recursive: true, force: true });
mkdirSync(outBase, { recursive: true });
cpSync(srcSkill, outSkill, { recursive: true });
console.log(`✔ skill → public/downloads/skill/wulonvocab-json`);

const samplesDir = join(root, "public", "samples");
mkdirSync(samplesDir, { recursive: true });
copyFileSync(join(srcSkill, "examples", "example-minimal.json"), join(samplesDir, "sample-import.json"));
console.log(`✔ 示例 → public/samples/sample-import.json`);
