import { describe, expect, it } from "vitest";
import { createSampleBook } from "@/lib/presets";
import { SECTION_TYPE_LIST, isValueEmpty } from "@/lib/sections";

describe("createSampleBook（示例词库）", () => {
  const book = createSampleBook();

  it("10 个词条，Schema 覆盖全部 14 种字段类型", () => {
    expect(book.entries).toHaveLength(10);
    const types = new Set(book.schema.sections.map((s) => s.type));
    for (const t of SECTION_TYPE_LIST) {
      expect(types.has(t), `缺少字段类型 ${t}`).toBe(true);
    }
  });

  it("每个词条的每个数据字段都已填写（divider 为装饰线、无数据，跳过）", () => {
    for (const e of book.entries) {
      for (const sec of book.schema.sections) {
        if (sec.type === "divider") continue;
        expect(isValueEmpty(sec.type, e.values[sec.key]), `${e.headword} 的「${sec.label}」为空`).toBe(false);
      }
    }
  });

  it("义项的每个子字段都有内容（开关全开时不留空白）", () => {
    for (const e of book.entries) {
      const senses = e.values.senses as Array<Record<string, unknown>>;
      for (const [i, sense] of senses.entries()) {
        for (const key of ["translation", "definition", "usage", "notes"] as const) {
          expect(String(sense[key] ?? "").trim().length, `${e.headword} 义项 ${i + 1} 的 ${key} 为空`).toBeGreaterThan(0);
        }
        for (const key of ["examples", "patterns", "synonyms", "antonyms", "collocations"] as const) {
          expect((sense[key] as unknown[]).length, `${e.headword} 义项 ${i + 1} 的 ${key} 为空`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("词性与释义的显示选项全开", () => {
    const senses = book.schema.sections.find((s) => s.type === "senses");
    expect(senses).toBeTruthy();
    for (const opt of [
      "groupByPos",
      "showTranslation",
      "showDefinition",
      "showExamples",
      "showUsage",
      "showPatterns",
      "showCollocations",
      "showSynonyms",
      "showAntonyms",
      "showNotes",
    ] as const) {
      expect((senses!.options as Record<string, unknown>)[opt], `显示选项 ${opt} 未开启`).toBe(true);
    }
  });
});
