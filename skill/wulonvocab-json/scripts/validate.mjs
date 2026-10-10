#!/usr/bin/env node
/**
 * WulonVocab JSON 校验脚本（零依赖）
 *
 * 用法：
 *   node validate.mjs my-words.json
 *
 * 退出码：0 = 通过（可能有警告）；1 = 存在错误。
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("用法：node validate.mjs <文件.json>");
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
} catch (e) {
  console.error(`✖ 无法读取文件：${e.message}`);
  process.exit(1);
}

let doc;
try {
  doc = JSON.parse(text);
} catch (e) {
  console.error(`✖ JSON 语法错误：${e.message}`);
  console.error("  提示：检查双引号、尾逗号、注释与转义字符。");
  process.exit(1);
}

const errors = [];
const warnings = [];

// 顶层结构
let entries;
if (Array.isArray(doc)) {
  entries = doc;
  warnings.push("顶层是数组：将按「纯词条列表」导入（可用，但建议补上 format/wordbook）。");
} else if (doc && typeof doc === "object") {
  if (doc.format && doc.format !== "wulonvocab") {
    warnings.push(`format 为 "${doc.format}"，期望 "wulonvocab"（仍会尝试导入）。`);
  }
  const key = ["entries", "words", "list", "data", "items"].find((k) => Array.isArray(doc[k]));
  if (key) {
    entries = doc[key];
    if (key !== "entries") warnings.push(`词条数组位于 "${key}"：导入器会自动识别。`);
  }
} 

if (!entries || !Array.isArray(entries)) {
  console.error("✖ 未找到词条数组（顶层 entries 字段）。");
  process.exit(1);
}
if (entries.length === 0) {
  console.error("✖ 词条数组为空。");
  process.exit(1);
}

// schema 键集合
const schemaKeys = new Set();
let schemaSections = [];
if (doc && doc.schema && Array.isArray(doc.schema.sections)) {
  schemaSections = doc.schema.sections;
  for (const s of schemaSections) {
    if (!s || typeof s.key !== "string" || !s.key) errors.push("schema.sections 中存在缺少 key 的字段。");
    else if (schemaKeys.has(s.key)) errors.push(`schema 中 key 重复："${s.key}"。`);
    else schemaKeys.add(s.key);
  }
}

// 逐条检查
const seen = new Map();
const fieldCount = new Map();
let unknownKeyCount = 0;
const unknownKeys = new Set();

entries.forEach((entry, i) => {
  const label = `#${i + 1}`;
  if (!entry || typeof entry !== "object") {
    errors.push(`${label} 不是对象。`);
    return;
  }
  const headword = entry.headword ?? entry.word ?? entry.term ?? entry["单词"];
  if (typeof headword !== "string" || !headword.trim()) {
    errors.push(`${label} 缺少 headword（或 word / term / 单词）。`);
  } else {
    const k = headword.trim().toLowerCase();
    if (seen.has(k)) warnings.push(`单词重复："${headword}"（#${seen.get(k) + 1} 与 ${label}，导入时会自动合并）。`);
    else seen.set(k, i);
  }

  const values = entry.values && typeof entry.values === "object" ? entry.values : entry;
  const keys = Object.keys(values).filter((k) => !["headword", "word", "term", "tags", "tag", "status", "starred", "values", "id", "source"].includes(k));
  for (const k of keys) {
    fieldCount.set(k, (fieldCount.get(k) ?? 0) + 1);
    if (schemaKeys.size && !schemaKeys.has(k)) {
      unknownKeyCount += 1;
      unknownKeys.add(k);
    }
  }
  const senses = values.senses ?? values.meanings ?? values.definitions;
  if (!senses) {
    warnings.push(`${label} "${headword ?? "?"}" 没有 senses（释义）字段。`);
  } else if (Array.isArray(senses)) {
    senses.forEach((s, si) => {
      if (typeof s === "string") return;
      if (!s || typeof s !== "object") {
        errors.push(`${label} 的 senses[${si}] 不是对象或字符串。`);
        return;
      }
      if (s.pos && !/^[a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff .&/]*\.?$/.test(String(s.pos))) {
        warnings.push(`${label} senses[${si}] 词性写法异常："${s.pos}"（建议使用 n. v. adj. 等标准缩写）。`);
      }
      const examples = s.examples ?? s.example;
      if (Array.isArray(examples)) {
        examples.forEach((ex, ei) => {
          if (typeof ex === "object" && ex && !ex.en && !ex.text && !ex.example) {
            warnings.push(`${label} senses[${si}].examples[${ei}] 缺少例句文本（en）。`);
          }
        });
      }
    });
  }
});

if (unknownKeyCount > 0) {
  warnings.push(`有 ${unknownKeyCount} 个字段键不在 schema 中（${[...unknownKeys].slice(0, 6).join(", ")}）：会进入「未定义字段」，可在编辑器中提升为正式字段。`);
}

// 输出
console.log("");
console.log(`文件：${file}`);
console.log(`词条：${entries.length} 条${doc?.wordbook?.name ? `　词库：「${doc.wordbook.name}」` : ""}`);
console.log(`字段：${[...fieldCount.entries()].map(([k, n]) => `${k}(${n})`).join(" ") || "（无）"}`);
console.log(schemaSections.length ? `Schema：${schemaSections.length} 个字段（${schemaSections.map((s) => s.key).join(", ")}）` : "Schema：未提供（导入时自动识别）");
console.log("");

for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✖ ${e}`);

if (errors.length) {
  console.log(`\n结果：${errors.length} 个错误，${warnings.length} 个警告。请修正后重试。`);
  process.exit(1);
} else {
  console.log(`\n✔ 校验通过（${warnings.length} 个警告）。可以直接在 WulonVocab → 导入 中导入！`);
  process.exit(0);
}
