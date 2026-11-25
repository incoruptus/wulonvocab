import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry, SenseItem } from "../types";
import { makeEntry } from "../presets";
import { buildQuizContribution, loadSharedWordQuiz, loadWordQuizQuestion, shardForWord } from "./quizBank";
import { createSampleBook } from "../presets";
import { SAMPLE_QUIZ_QUESTIONS } from "./sampleQuizBank";

function entry(): Entry {
  const sense: SenseItem = {
    id: "s-leak",
    pos: "v.",
    translation: "泄漏",
    definition: "to allow liquid or gas to escape accidentally",
    examples: [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  };
  return makeEntry({ id: "leak", headword: "leak", values: { senses: [sense] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("公共 Word Quiz 题库", () => {
  it("分片稳定且匿名读取清单与对应分片", async () => {
    const target = entry();
    const shardId = shardForWord("leak");
    const manifest = {
      schemaVersion: 1,
      updatedAt: "2026-11-25T00:00:00.000Z",
      shards: [{ id: shardId, url: `https://example.com/${shardId}.json` }],
    };
    const shard = {
      schemaVersion: 1,
      updatedAt: "2026-11-25T00:00:00.000Z",
      questions: [{
        id: "leak-zh2word-1",
        version: 1,
        word: "leak",
        pos: "v.",
        kind: "zh2word",
        clue: "泄漏",
        level: "B1",
        status: "approved",
        updatedAt: "2026-11-25T00:00:00.000Z",
        attribution: { author: "测试贡献者", license: "CC0-1.0" },
        options: [
          { text: "leak", correct: true, role: "correct" },
          { text: "pour", correct: false, role: "confusable", note: "pour 强调倾倒，leak 强调意外漏出" },
          { text: "flow", correct: false, role: "contrast" },
          { text: "drop", correct: false, role: "contrast" },
        ],
      }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(shard), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadSharedWordQuiz(target, "zh2word", "https://example.com/manifest.json", { forceCorrectIndex: 2 });
    expect(result?.question.sharedId).toBe("leak-zh2word-1");
    expect(result?.question.correctIndex).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  });

  it("题库短暂失败时不同子型共享冷却，不累计等待", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const question = await loadWordQuizQuestion(entry(), [entry()], ["word2zh", "word2def", "zh2word"], {
      bankUrl: "https://offline.example/manifest.json",
    });
    expect(question).toBeNull(); // 候选池不足四选项时按规则不出题
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("个人层优先时不请求公共网络，且个人题可覆盖内置编辑题", async () => {
    const target = createSampleBook().entries[0];
    const personal = SAMPLE_QUIZ_QUESTIONS.find((question) => question.word === target.headword && question.kind === "word2zh")!;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadWordQuizQuestion(target, [target], ["word2zh"], {
      bankSource: "personal",
      bankUrl: "https://example.com/manifest.json",
      personalQuestions: [personal],
      fallbackQuestions: SAMPLE_QUIZ_QUESTIONS,
    });
    expect(result?.options).toEqual(personal.options);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("阶段不可用的子型不会回退成其他选择题", async () => {
    const target = createSampleBook().entries[0];
    const personalDef = SAMPLE_QUIZ_QUESTIONS.find((question) => question.word === target.headword && question.kind === "def2word")!;
    const result = await loadWordQuizQuestion(target, createSampleBook().entries, ["def2word"], {
      bankSource: "personal",
      personalQuestions: [personalDef],
      fallbackQuestions: SAMPLE_QUIZ_QUESTIONS,
    });
    expect(target.srs).toBeUndefined();
    expect(result).toBeNull();
  });

  it("单文件公共题库无需分片清单", async () => {
    const target = createSampleBook().entries[0];
    const raw = SAMPLE_QUIZ_QUESTIONS.find((question) => question.word === target.headword && question.kind === "word2zh")!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      format: "wulonvocab-public-quiz-bank",
      schemaVersion: 1,
      updatedAt: "2026-11-25T00:00:00.000Z",
      questions: [{ ...raw, id: "public-1", status: "approved", version: 1 }],
    }), { status: 200 })));
    const result = await loadWordQuizQuestion(target, [target], ["word2zh"], { bankUrl: "https://example.com/bank.json" });
    expect(result?.sharedId).toBe("public-1");
  });

  it("贡献包只含题目与署名，不带学习数据或凭据", async () => {
    const target = entry();
    const shared = await loadSharedWordQuiz(target, "zh2word", "");
    expect(shared).toBeNull();
    const question = {
      word: "leak",
      kind: "zh2word" as const,
      pos: "v.",
      clue: "泄漏",
      hideWord: true,
      correctIndex: 0,
      options: [
        { text: "leak", correct: true, role: "correct" as const },
        { text: "pour", correct: false, role: "confusable" as const, note: "倾倒与意外漏出不同" },
        { text: "flow", correct: false, role: "contrast" as const },
        { text: "drop", correct: false, role: "contrast" as const },
      ],
    };
    const text = buildQuizContribution(question, { author: "龙", license: "CC-BY-4.0" });
    expect(text).toContain("CC-BY-4.0");
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("srs");
    expect(shardForWord("Leak")).toBe(shardForWord("leak"));
  });
});
