import { describe, expect, it } from "vitest";
import { createSampleBook } from "../presets";
import { firstDefinition, firstTranslation, validateQuizQuestion } from "./quiz";
import { SAMPLE_QUIZ_QUESTIONS, loadSampleWordQuiz } from "./sampleQuizBank";
import { buildPublicQuizBankFile, loadPersonalWordQuiz, mergePersonalQuizQuestions } from "./quizBank";

const book = createSampleBook();

describe("示例十词编辑题", () => {
  it("十个词各覆盖四个子型，共 40 题", () => {
    expect(book.entries).toHaveLength(10);
    expect(SAMPLE_QUIZ_QUESTIONS).toHaveLength(40);
    for (const entry of book.entries) {
      expect(SAMPLE_QUIZ_QUESTIONS.filter((question) => question.word === entry.headword)).toHaveLength(4);
    }
  });

  it("全部通过唯一答案、四选项与词条义项一致性校验", () => {
    for (const entry of book.entries) {
      const translation = firstTranslation(entry);
      const definition = firstDefinition(entry);
      for (const question of SAMPLE_QUIZ_QUESTIONS.filter((item) => item.word === entry.headword)) {
        expect(validateQuizQuestion(question, {
          word: entry.headword,
          pos: question.pos,
          kind: question.kind,
          translation: translation?.text,
          definition: definition?.text,
        }), `${entry.headword}:${question.kind}`).not.toBeNull();
      }
    }
  });

  it("只返回当前阶段启用且命中的题型", () => {
    const entry = book.entries[0];
    expect(loadSampleWordQuiz(entry, ["word2zh"])?.kind).toBe("word2zh");
    expect(loadSampleWordQuiz(entry, ["def2word"])).toBeNull();
  });
});

describe("个人公共题库", () => {
  it("个人题按较新版本合并且保持稳定 ID", () => {
    const original = SAMPLE_QUIZ_QUESTIONS[0];
    const newer = { ...original, updatedAt: 10, pos: "v." };
    expect(mergePersonalQuizQuestions([{ ...original, updatedAt: 1 }], [newer])).toEqual([newer]);
  });

  it("个人题与公共题使用同一校验器", () => {
    const entry = book.entries[0];
    const valid = SAMPLE_QUIZ_QUESTIONS.find((question) => question.word === entry.headword && question.kind === "word2zh")!;
    const invalid = { ...valid, options: valid.options.map((option) => ({ ...option, correct: true })) };
    expect(loadPersonalWordQuiz(entry, ["word2zh"], [invalid])).toBeNull();
    expect(loadPersonalWordQuiz(entry, ["word2zh"], [valid])?.correctIndex).toBe(0);
  });

  it("一键生成的公共文件只含题目与署名，不带学习数据", () => {
    const text = JSON.stringify(buildPublicQuizBankFile(SAMPLE_QUIZ_QUESTIONS.slice(0, 4)));
    expect(text).toContain("wulonvocab-public-quiz-bank");
    expect(text).toContain('"status":"approved"');
    expect(text).not.toContain("srs");
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("personalQuizBank");
  });
});
