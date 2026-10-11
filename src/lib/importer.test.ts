import { describe, expect, it } from "vitest";
import {
  buildImportResult,
  classifyJson,
  draftToValues,
  ecDictRowToValues,
  isEcDictRow,
  mergeDuplicateEntries,
  mergeEntryBodies,
  parseImportCsv,
  parseImportJson,
} from "@/lib/importer";
import { defaultSchema } from "@/lib/presets";
import { makeEntry } from "@/lib/presets";

describe("mergeEntryBodies（批量合并内核）", () => {
  it("保留 target 的 id/headword/createdAt/srs；标签并集、星标取或", () => {
    const target = makeEntry({
      id: "t1",
      headword: "abandon",
      createdAt: 100,
      updatedAt: 200,
      tags: ["cet4"],
      starred: false,
    });
    target.srs = { ...makeEntry({ headword: "x" }).srs, reps: 3 } as typeof target.srs;
    const incoming = makeEntry({ id: "t2", headword: "abandon", tags: ["考研", "cet4"], starred: true });
    const merged = mergeEntryBodies(target, incoming, 999);
    expect(merged.id).toBe("t1");
    expect(merged.headword).toBe("abandon");
    expect(merged.createdAt).toBe(100);
    expect(merged.updatedAt).toBe(999);
    expect(merged.tags.sort()).toEqual(["cet4", "考研"]);
    expect(merged.starred).toBe(true);
    expect(merged.srs?.reps).toBe(3); // 学习进度不被覆盖
  });

  it("值合并：数组去重拼接 / 对象浅并 / 不同字符串换行相连 / 空值被填充", () => {
    const target = makeEntry({
      headword: "m",
      values: {
        tags: ["a", "b"],
        phonetic: { uk: "/m/" },
        senses: [{ id: "s1", pos: "n.", translation: "甲" }],
        origin: "",
        summary: "甲概述",
      },
    });
    const incoming = makeEntry({
      headword: "m",
      values: {
        tags: ["b", "c"],
        phonetic: { us: "/em/" },
        senses: [{ id: "s1", pos: "n.", translation: "乙" }],
        origin: "来自拉丁语",
        summary: "乙概述",
      },
    });
    const merged = mergeEntryBodies(target, incoming, 1);
    expect(merged.values.tags).toEqual(["a", "b", "c"]);
    expect(merged.values.phonetic).toEqual({ uk: "/m/", us: "/em/" });
    expect(merged.values.origin).toBe("来自拉丁语");
    expect(merged.values.summary).toBe("甲概述\n乙概述"); // 不同字符串换行相连
    // senses 为数组：去重拼接（同 id 但内容不同 → 作为两项保留，不丢内容）
    const senses = merged.values.senses as Array<{ translation?: string }>;
    expect(senses.map((s) => s.translation)).toEqual(["甲", "乙"]);
  });
});

describe("classifyJson", () => {
  it("识别完整文档", () => {
    const parsed = parseImportJson(
      JSON.stringify({
        format: "wulonvocab",
        version: 1,
        wordbook: { name: "测试" },
        schema: { sections: [{ key: "phonetic", label: "音标", type: "pronunciation" }] },
        entries: [{ headword: "abandon", values: { phonetic: { uk: "/x/" } } }],
      }),
    );
    expect(parsed.kind).toBe("wulonvocab");
    expect(parsed.schema?.sections[0].key).toBe("phonetic");
    expect(parsed.wordbookMeta?.name).toBe("测试");
  });

  it("识别纯数组与映射对象", () => {
    expect(classifyJson([{ word: "a" }]).kind).toBe("rows");
    const map = classifyJson({ abandon: { translation: "抛弃" } });
    expect(map.kind).toBe("map");
    expect(map.rows[0].headword).toBe("abandon");
  });

  it("识别单词字符串数组", () => {
    const parsed = classifyJson(["apple", "banana"]);
    expect(parsed.rows.map((r) => r.headword)).toEqual(["apple", "banana"]);
  });
});

describe("ECDICT", () => {
  it("识别 ECDICT 行", () => {
    expect(isEcDictRow({ word: "abandon", translation: "vt. 放弃", exchange: "p:abandoned", tag: "cet4" })).toBe(true);
    expect(isEcDictRow({ headword: "abandon", senses: [] })).toBe(false);
  });

  it("转换交换码 / 释义 / 标签", () => {
    const { values, tags } = ecDictRowToValues({
      word: "abandon",
      phonetic: "ə'bændən",
      translation: "vt. 放弃；抛弃\\nn. 放任",
      definition: "to give up\\nthe state of being free",
      exchange: "p:abandoned/d:abandoned/i:abandoning/3:abandons",
      tag: "cet4 ky",
      collins: "3",
    });
    expect(values.phonetic).toEqual({ uk: "/ə'bændən/" });
    const senses = values.senses as { pos: string; translation: string; definition: string }[];
    expect(senses).toHaveLength(2);
    expect(senses[0]).toMatchObject({ pos: "vt.", translation: "放弃；抛弃" });
    expect(senses[1].pos).toBe("n.");
    expect(senses[0].definition).toBe("to give up");
    const transforms = values.transforms as { form: string; note: string }[];
    expect(transforms.map((t) => t.note)).toEqual(["过去式", "过去分词", "现在分词", "第三人称单数"]);
    expect(values.contexts).toEqual(["四级", "考研"]);
    expect(tags).toEqual(["cet4", "ky"]);
    expect((values.collins as { value: number }).value).toBe(3);
  });
});

describe("CSV 导入", () => {
  it("带表头的 CSV", () => {
    const csv = "word,translation,phonetic\nabandon,vt. 放弃,ə'bændən\n";
    const parsed = parseImportCsv(csv, "a.csv");
    expect(parsed.rows[0].word).toBe("abandon");
    expect(parsed.kind).toBe("rows");
  });
  it("无表头按 ECDICT 列序解析", () => {
    const csv = "abandon,ə'bændən,,vt. 放弃,,,\n";
    const parsed = parseImportCsv(csv, "a.csv");
    expect(parsed.warnings.some((w) => w.includes("ECDICT"))).toBe(true);
    expect(isEcDictRow(parsed.rows[0])).toBe(true);
  });
});

describe("buildImportResult", () => {
  it("省略 schema 时自动推断字段", () => {
    const parsed = classifyJson([
      { headword: "abandon", phonetic: "x", senses: [{ pos: "v.", translation: "抛弃" }], contexts: ["考研"] },
    ]);
    const result = buildImportResult(parsed, { name: "测试" });
    expect(result.schemaOrigin).toBe("inferred");
    const keys = result.schema.sections.map((s) => s.key);
    expect(keys).toContain("phonetic");
    expect(keys).toContain("senses");
    expect(keys).toContain("contexts");
    const phonetic = result.schema.sections.find((s) => s.key === "phonetic")!;
    expect(phonetic.type).toBe("pronunciation");
    const senses = result.schema.sections.find((s) => s.key === "senses")!;
    expect(senses.type).toBe("senses");
  });

  it("合并重复单词", () => {
    const entries = [
      makeEntry({ headword: "abandon", values: { senses: [{ id: "1", pos: "v.", translation: "抛弃", definition: "", examples: [], usage: "", patterns: [], synonyms: [], antonyms: [], collocations: [], notes: "" }] } }),
      makeEntry({ headword: "Abandon", values: { senses: [{ id: "2", pos: "v.", translation: "放弃", definition: "", examples: [], usage: "", patterns: [], synonyms: [], antonyms: [], collocations: [], notes: "" }] } }),
    ];
    const merged = mergeDuplicateEntries(entries);
    expect(merged).toHaveLength(1);
    expect((merged[0].values.senses as unknown[]).length).toBe(2);
  });
});

describe("draftToValues", () => {
  it("只填充 schema 定义的字段（默认不保留额外键）", () => {
    const schema = defaultSchema();
    const { values, added } = draftToValues(
      { senses: [{ pos: "v.", translation: "抛弃" }], unknownKey: "x" },
      schema,
    );
    expect(added).toContain("senses");
    expect(values.unknownKey).toBeUndefined();
    expect((values.senses as unknown[]).length).toBe(1);
  });

  it("keepExtras 时保留未知键", () => {
    const schema = defaultSchema();
    const { values } = draftToValues({ custom: "x" }, schema, {}, { keepExtras: true });
    expect(values.custom).toBe("x");
  });
});
