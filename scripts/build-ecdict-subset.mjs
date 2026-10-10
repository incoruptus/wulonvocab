// 生成内置 ECDICT 子集（精要 2 万 / 标准 5 万档）。
//
// 输入：ECDICT 基础版 ecdict.csv（github.com/skywind3000/ECDICT，MIT）
//   node scripts/build-ecdict-subset.mjs "C:/path/to/ecdict.csv"
//
// 输出：
//   public/dicts/ecdict-20k.csv.gz  词频(B NC∪COCA)前 2 万 ∪ 考纲标注词 ≈ 2.8 万词
//   public/dicts/ecdict-50k.csv.gz  词频前 5 万 ∪ 考纲标注词 ≈ 6 万词
// 列（11 列精简，保留 ECDICT 原表头名，导入侧按名识别）：
//   word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
//
// 说明：重写时用 PapaParse 标准转义（字段内真实换行 → 引号包裹），
// 修正上游直接裁剪脚本产生「无表头 + 字面 \\r\\n」的兼容性问题。
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import Papa from "papaparse";

const src = process.argv[2] ?? process.env.ECDICT_CSV;
if (!src) {
  console.error("[ecdict] 用法：node scripts/build-ecdict-subset.mjs <ecdict.csv 路径>");
  process.exit(1);
}

const COLS = ["word", "phonetic", "definition", "translation", "pos", "collins", "oxford", "tag", "bnc", "frq", "exchange"];
const root = resolve(process.cwd());
const outDir = join(root, "public", "dicts");
mkdirSync(outDir, { recursive: true });

console.log(`[ecdict] 读取 ${src}（${(statSync(src).size / 1048576).toFixed(1)} MB）…`);
const text = readFileSync(src, "utf8");
const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
if (parsed.errors.length) {
  console.warn(`[ecdict] 解析告警 ${parsed.errors.length} 条（前 3）：`, parsed.errors.slice(0, 3).map((e) => e.message));
}
const rows = parsed.data;

const isExamWord = (r) =>
  Boolean(String(r.tag ?? "").trim() || String(r.oxford ?? "").trim() || String(r.collins ?? "").trim());

function build(limit, outName) {
  const picked = rows.filter((r) => {
    if (!r.word) return false;
    const bnc = Number(r.bnc) || 0;
    const frq = Number(r.frq) || 0;
    const topFreq = (bnc > 0 && bnc <= limit) || (frq > 0 && frq <= limit);
    return topFreq || isExamWord(r);
  });
  const csv = Papa.unparse({ fields: COLS, data: picked.map((r) => COLS.map((c) => r[c] ?? "")) });
  const gz = gzipSync(Buffer.from(csv, "utf8"), { level: 9 });
  const out = join(outDir, outName);
  writeFileSync(out, gz);
  console.log(`[ecdict] ${outName}：${picked.length} 词 · 原始 ${(csv.length / 1048576).toFixed(1)}MB · gzip ${(gz.length / 1048576).toFixed(1)}MB`);
  return picked.length;
}

console.log(`[ecdict] 总词条 ${rows.length}`);
build(20000, "ecdict-20k.csv.gz");
build(50000, "ecdict-50k.csv.gz");
console.log("[ecdict] 完成");
