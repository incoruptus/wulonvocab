import { describe, expect, it } from "vitest";
import { createEmptyBook, makeEntry } from "../presets";
import type { Entry, SenseItem } from "../types";
import {
  answerFormsOf,
  buildCloze,
  buildSpellQuestion,
  clozeFromExample,
  gradeProductionAnswer,
  normalizeProductionAnswer,
  productionSegments,
} from "./production";

function entry(word: string, sentence?: string, transforms: string[] = []): Entry {
  const sense: SenseItem = {
    id: "s1",
    pos: "v.",
    translation: "放弃",
    definition: "to stop doing something",
    examples: sentence ? [{ en: sentence, zh: "他放弃了这个机会。" }] : [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  };
  return makeEntry({
    headword: word,
    values: {
      senses: [sense],
      transforms: transforms.map((form) => ({ form, pos: "v.", note: "" })),
    },
  });
}

describe("例句 Cloze", () => {
  it("生成单空、可还原且保留上下文的题目", () => {
    const question = buildCloze(entry("abandon", "He decided to abandon the plan."));
    expect(question).not.toBeNull();
    expect(question?.kind).toBe("cloze");
    expect(question?.answer).toBe("abandon");
    expect(question?.blankLength).toBe(7);
    expect(productionSegments(question!)?.before).toBe("He decided to ");
    expect(productionSegments(question!)?.after).toBe(" the plan.");
    expect(question?.translation).toContain("放弃");
  });

  it("识别词条中明确保存的变形", () => {
    const target = entry("abandon", "The plan was abandoned yesterday.", ["abandoned"]);
    expect(answerFormsOf(target)).toContain("abandoned");
    expect(buildCloze(target)?.answer).toBe("abandoned");
    expect(gradeProductionAnswer("abandoned", buildCloze(target)!).exact).toBe(true);
  });

  it("拒绝超过 12 词、目标重复或目标缺失的例句", () => {
    expect(buildCloze(entry("ridge", "A narrow ridge rose above the quiet valley while clouds moved slowly across the wide blue sky."))).toBeNull();
    expect(buildCloze(entry("ridge", "The ridge and the ridge path were visible."))).toBeNull();
    expect(buildCloze(entry("ridge", "The mountain path was visible."))).toBeNull();
    expect(buildCloze(entry("ridge"))).toBeNull();
  });

  it("不会把词内片段当完整单词", () => {
    expect(buildCloze(entry("cat", "The catalog sat open."))).toBeNull();
  });

  it("读取动态例句字段，不硬编码字段键", () => {
    const book = createEmptyBook("Cloze 测试");
    book.schema.sections.push({ id: "quotes", key: "myExamples", label: "我的例句", type: "examples", order: 90, visible: true, options: {} });
    const target = entry("persist");
    target.values.myExamples = [{ en: "Many people persist despite the noise.", zh: "尽管很吵，许多人还是坚持下来了。" }];
    expect(buildCloze(target, book)?.answer).toBe("persist");
  });

  it("大小写不敏感，答案保持例句中的真实形式", () => {
    const question = clozeFromExample(entry("persist"), { en: "She persist and persist." });
    expect(question).toBeNull();
    const q = clozeFromExample(entry("persist", undefined, ["persisted"]), { en: "She persisted." });
    expect(q?.answer).toBe("persisted");
  });
});

describe("拼写与首次提交评分", () => {
  it("拼写题隐藏词头并提供释义线索", () => {
    const question = buildSpellQuestion(entry("abandon"));
    expect(question?.kind).toBe("spell");
    expect(question?.hideWord).toBe(true);
    expect(question?.clue).toBe("放弃");
    expect(question?.acceptedAnswers).toEqual(["abandon"]);
  });

  it("精确记 Good，一个字符之差记 Hard，其他记 Again", () => {
    const question = buildSpellQuestion(entry("abandon"))!;
    expect(gradeProductionAnswer("  ABANDON ", question)).toEqual({ rating: 3, exact: true, distance: 0 });
    expect(gradeProductionAnswer("abandn", question)).toEqual({ rating: 2, exact: false, distance: 1 });
    expect(gradeProductionAnswer("ability", question).rating).toBe(1);
  });

  it("归一化全角字符、弯引号与多余空格", () => {
    expect(normalizeProductionAnswer("  ＡＢＡＮＤＯＮ ")).toBe("abandon");
    expect(normalizeProductionAnswer("can’t")).toBe("can't");
  });

  it("没有释义时拼写题优雅回退", () => {
    const target = makeEntry({ headword: "plain" });
    expect(buildSpellQuestion(target)).toBeNull();
  });
});
