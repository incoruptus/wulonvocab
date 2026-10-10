#!/usr/bin/env node
/**
 * 编码守卫：扫描 src 下字符串字面量中的「mojibake 残留」
 * （连续 ?? 且不含中文 —— 早期 PowerShell ANSI 事故会留下这种特征）。
 * 用法：npm run check:encoding（应输出 0 个疑似项）
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "src";
const hits = [];

function stripTemplates(s) {
  // 粗略去掉 ${...} 片段（不处理嵌套），避免把 ?? 运算符当作字符串内容
  let out = "";
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "$" && s[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (depth > 0) {
      if (s[i] === "{") depth += 1;
      else if (s[i] === "}") depth -= 1;
      continue;
    }
    out += s[i];
  }
  return out;
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      const text = readFileSync(full, "utf8");
      text.split("\n").forEach((line, i) => {
        const re = /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;
        let m;
        while ((m = re.exec(line)) !== null) {
          const content = stripTemplates(m[2]);
          if (!/\?{2,}/.test(content)) continue;
          if (/[\u4e00-\u9fff]/.test(content)) continue; // 含中文的字符串正常
          if (/^\?{1,2}$/.test(content.trim())) continue; // 单个/两个问号（罕见占位）跳过
          hits.push(`${full}:${i + 1}: ${m[0].slice(0, 120)}`);
        }
      });
    }
  }
}

walk(root);
console.log(`mojibake suspects: ${hits.length}`);
for (const h of hits) console.log(h);
