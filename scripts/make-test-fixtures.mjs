// 生成多模态导入的本地测试夹具（docx / pdf），供开发与 E2E 验证。
//   node scripts/make-test-fixtures.mjs
// 产物在 test-fixtures/（gitignore，不入库）。
// 说明：jsPDF 内置字体无 CJK/IPA 字形，PDF 夹具使用 ASCII 词表以验证「文本层提取」链路；
// docx 夹具包含 IPA 与中文，验证 mammoth 的完整字符链路。
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { jsPDF } from "jspdf";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures");
mkdirSync(outDir, { recursive: true });

/* ---------------- docx（表格 → CSV 行） ---------------- */
{
  const rows = [
    ["word", "phonetic", "translation"],
    ["abnegation", "/ˌæbnɪˈɡeɪʃn/", "放弃；克制"],
    ["abhor", "/əbˈhɔː(r)/", "厌恶；憎恶"],
    ["resilient", "/rɪˈzɪliənt/", "有韧性的；适应力强的"],
  ];
  const cell = (t) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>示例词表（脚本生成）</w:t></w:r></w:p>
<w:tbl>${rows.map((r) => `<w:tr>${r.map(cell).join("")}</w:tr>`).join("")}</w:tbl>
</w:body></w:document>`;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word").file("document.xml", xml);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(join(outDir, "vocab-sample.docx"), buf);
  console.log(`[fixtures] vocab-sample.docx（${buf.length} B）`);
}

/* ---------------- pdf（文本层，ASCII） ---------------- */
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(12);
  const lines = ["word,translation", "abnegation,giving up", "abhor,to hate", "resilient,tough"];
  lines.forEach((line, i) => doc.text(line, 40, 60 + i * 18));
  const ab = doc.output("arraybuffer");
  const buf = Buffer.from(ab);
  writeFileSync(join(outDir, "vocab-sample.pdf"), buf);
  console.log(`[fixtures] vocab-sample.pdf（${buf.length} B）`);
}
