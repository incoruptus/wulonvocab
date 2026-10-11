import { describe, expect, it } from "vitest";
import {
  buildSenseUnits,
  dedupe,
  isValueEmpty,
  normalizeExamples,
  normalizeKeyValue,
  normalizePos,
  normalizePronunciation,
  normalizeSenses,
  normalizeTable,
  normalizeTransforms,
  normalizeValue,
  parsePosPrefix,
  sanitizeText,
  sliceSenseCells,
  sliceValue,
  splitBilingual,
  splitEnumeration,
  strList,
  valueLength,
} from "@/lib/sections";

describe("sanitizeText", () => {
  it("清理 HTML、Anki 记号与零宽字符", () => {
    expect(sanitizeText("hello<br>world")).toBe("hello\nworld");
    expect(sanitizeText("<b>abandon</b>")).toBe("abandon");
    expect(sanitizeText("{{c1::答案::提示}}")).toBe("答案");
    expect(sanitizeText("[sound:x.mp3]word")).toBe("word");
    expect(sanitizeText("a\u200bb")).toBe("ab");
  });
});

describe("parsePosPrefix / normalizePos", () => {
  it("识别词性前缀", () => {
    expect(parsePosPrefix("vt. 放弃；抛弃")).toEqual({ pos: "vt.", rest: "放弃；抛弃" });
    expect(parsePosPrefix("n.放任")).toEqual({ pos: "n.", rest: "放任" });
    expect(parsePosPrefix("抛弃")).toEqual({ rest: "抛弃" });
  });
  it("归一化词性别名", () => {
    expect(normalizePos("verb")).toBe("v.");
    expect(normalizePos("adj")).toBe("adj.");
    expect(normalizePos("名词")).toBe("n.");
  });
});

describe("strList / dedupe", () => {
  it("接受多种形态并去重", () => {
    expect(strList("a\nb；c;d|e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(strList(["x", "x", "y"])).toEqual(["x", "y"]);
    expect(strList({ text: "hello" })).toEqual(["hello"]);
    expect(dedupe(["A", "a", "b"])).toEqual(["A", "b"]);
  });
});

describe("splitBilingual / normalizeExamples", () => {
  it("按中英文字符边界拆分", () => {
    expect(splitBilingual("The baby was abandoned. 婴儿被遗弃了。")).toEqual({
      en: "The baby was abandoned.",
      zh: "婴儿被遗弃了。",
    });
  });
  it("归一化各种例句形态", () => {
    const list = normalizeExamples([
      "He abandoned ship. 他弃船了。",
      { text: "Snow forced drivers to stop.", translation: "大雪迫使司机停下。" },
      { example: "She abandoned hope." },
      ["The match was abandoned.", "比赛中止了。"],
    ]);
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({ en: "He abandoned ship.", zh: "他弃船了。", source: undefined });
    expect(list[1].zh).toBe("大雪迫使司机停下。");
    expect(list[3].en).toBe("The match was abandoned.");
    expect(list[3].zh).toBe("比赛中止了。");
  });
});

describe("normalizeSenses", () => {
  it("字符串形态 + 词性前缀", () => {
    const senses = normalizeSenses("v. 抛弃；遗弃");
    expect(senses).toHaveLength(1);
    expect(senses[0].pos).toBe("v.");
    expect(senses[0].translation).toBe("抛弃；遗弃");
  });

  it("按词性分组对象展开", () => {
    const senses = normalizeSenses({
      v: [{ translation: "放弃" }, "中止"],
      n: [{ translation: "放任" }],
    });
    expect(senses.map((s) => s.pos)).toEqual(["v.", "v.", "n."]);
    expect(senses.map((s) => s.translation)).toEqual(["放弃", "中止", "放任"]);
  });

  it("嵌套 senses 继承词性", () => {
    const senses = normalizeSenses([
      { pos: "v.", senses: [{ translation: "抛弃" }, { translation: "放弃" }] },
    ]);
    expect(senses).toHaveLength(2);
    expect(senses.every((s) => s.pos === "v.")).toBe(true);
  });

  it("平行数组按索引配对", () => {
    const senses = normalizeSenses({
      pos: "n.",
      definitions: ["the state of being away", "freedom from worry"],
      translations: ["离开；放任", "无忧无虑"],
    });
    expect(senses).toHaveLength(2);
    expect(senses[0].definition).toContain("being away");
    expect(senses[0].translation).toBe("离开；放任");
  });

  it("内联枚举拆分多个义项", () => {
    const senses = normalizeSenses({ pos: "v.", translation: "①放弃 ②抛弃 ③中止" });
    expect(senses).toHaveLength(3);
    expect(senses[2].translation).toBe("中止");
  });

  it("完整字段归一化", () => {
    const [s] = normalizeSenses({
      pos: "v",
      zh: "抛弃",
      definition: "to leave sb",
      example: "He abandoned his car.",
      patterns: "abandon sth",
      synonyms: "desert, forsake",
      collocations: ["abandon hope"],
      usage: "常用被动",
      notes: "高频考点",
    });
    expect(s.pos).toBe("v.");
    expect(s.examples[0].en).toBe("He abandoned his car.");
    expect(s.patterns).toEqual(["abandon sth"]);
    expect(s.synonyms).toEqual(["desert", "forsake"]);
    expect(s.collocations).toEqual(["abandon hope"]);
    expect(s.usage).toBe("常用被动");
    expect(s.notes).toBe("高频考点");
  });
});

describe("normalizePronunciation / normalizeKeyValue / normalizeTransforms / normalizeTable", () => {
  it("音标", () => {
    expect(normalizePronunciation("əˈbændən")).toEqual({ uk: "/əˈbændən/" });
    expect(normalizePronunciation({ bre: "x", ame: "y" })).toEqual({ uk: "/x/", us: "/y/" });
  });
  it("词族键值对", () => {
    expect(normalizeKeyValue({ abandonment: "n. 遗弃" })).toEqual([{ key: "abandonment", value: "n. 遗弃" }]);
    expect(normalizeKeyValue("abandonment n. 遗弃")[0].key).toBe("abandonment");
  });
  it("词形变化", () => {
    const t = normalizeTransforms({ n: "abandonment", past: "abandoned" });
    expect(t).toContainEqual(expect.objectContaining({ form: "abandonment", pos: "n." }));
    expect(t).toContainEqual(expect.objectContaining({ form: "abandoned", note: "过去式" }));
    expect(normalizeTransforms("abandoned (过去式)")[0].form).toBe("abandoned");
  });
  it("表格", () => {
    const t = normalizeTable({ columns: ["词", "语气"], rows: [["desert", "正式"]] });
    expect(t.columns).toEqual(["词", "语气"]);
    expect(t.rows).toEqual([["desert", "正式"]]);
    const t2 = normalizeTable([["a", "b"], ["1", "2"]]);
    expect(t2.columns).toEqual(["a", "b"]);
    expect(t2.rows).toEqual([["1", "2"]]);
  });
});

describe("sliceValue / valueLength", () => {
  it("数组切片与长度", () => {
    const senses = normalizeSenses([{ translation: "a" }, { translation: "b" }, { translation: "c" }]);
    expect(valueLength("senses", senses)).toBe(3);
    expect((sliceValue("senses", senses, 1, 3) as unknown[]).length).toBe(2);
    expect(sliceValue("senses", senses, 0, 3)).toEqual(senses);
  });
  it("表格按行切片", () => {
    const t = { columns: ["a"], rows: [["1"], ["2"], ["3"]] };
    expect(sliceValue("table", t, 1, 3)).toEqual({ columns: ["a"], rows: [["2"], ["3"]] });
  });
});

describe("splitEnumeration", () => {
  it("少于两个标记时不拆分", () => {
    expect(splitEnumeration("1. 只有一个")).toEqual(["1. 只有一个"]);
  });
});

describe("buildSenseUnits / sliceSenseCells（义项细粒度分页）", () => {
  it("有扩展内容拆两段；被选项隐藏时不拆", () => {
    const bare = normalizeSenses([{ pos: "v.", translation: "只有释义" }]);
    expect(buildSenseUnits(bare, {})).toHaveLength(1);
    const rich = normalizeSenses([{ pos: "v.", translation: "释义", examples: ["The baby was abandoned. 婴儿被遗弃了。"] }]);
    expect(buildSenseUnits(rich, {})).toHaveLength(2);
    expect(buildSenseUnits(rich, { showExamples: false })).toHaveLength(1);
  });

  it("core 段清空扩展内容，extras 段清空核心并标记 cont（不改原数据）", () => {
    const [s] = normalizeSenses([
      { pos: "v.", translation: "抛弃", examples: ["He abandoned it. 他抛弃了它。"], collocations: ["abandon hope"] },
    ]);
    const before = JSON.stringify(s);
    const cells = [
      { from: 0, to: 1, part: "core" as const },
      { from: 0, to: 1, part: "extras" as const },
    ];
    const [core, extras] = sliceSenseCells([s], cells);
    expect(core.translation).toBe("抛弃");
    expect(core.examples).toHaveLength(0);
    expect(core.collocations).toHaveLength(0);
    expect(extras.cont).toBe(true);
    expect(extras.translation).toBe("");
    expect(extras.examples).toHaveLength(1);
    expect(extras.collocations).toEqual(["abandon hope"]);
    expect(JSON.stringify(s)).toBe(before); // 原数据未被修改
  });
});

describe("normalizeValue / isValueEmpty 防御（审计盲区）", () => {
  const TYPES = ["text", "tags", "senses", "examples", "keyvalue", "table", "transforms", "list", "image"] as const;

  it("畸形输入不抛错（对象 / 数字 / null / undefined / 布尔 / 混合数组）", () => {
    for (const t of TYPES) {
      for (const raw of [{ weird: true }, 12345, null, undefined, false, [null, 1, {}]]) {
        expect(() => normalizeValue(t, raw)).not.toThrow();
      }
    }
  });

  it("isValueEmpty 矩阵：空形态为 true、有内容为 false", () => {
    expect(isValueEmpty("text", "")).toBe(true);
    expect(isValueEmpty("text", "x")).toBe(false);
    expect(isValueEmpty("tags", [])).toBe(true);
    expect(isValueEmpty("tags", ["a"])).toBe(false);
    expect(isValueEmpty("senses", [])).toBe(true);
    expect(isValueEmpty("senses", [{ pos: "n.", translation: "书" }])).toBe(false);
    expect(isValueEmpty("examples", [])).toBe(true);
    expect(isValueEmpty("keyvalue", [])).toBe(true);
    expect(isValueEmpty("table", [])).toBe(true);
    expect(isValueEmpty("list", [])).toBe(true);
    expect(isValueEmpty("list", ["条目"])).toBe(false);
    expect(isValueEmpty("image", null)).toBe(true);
  });
});
