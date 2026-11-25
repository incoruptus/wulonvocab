import { describe, expect, it } from "vitest";
import type { Entry, SenseItem } from "../types";
import { createEmptyBook, makeEntry } from "../presets";
import { buildQuizQuestion, bigramJaccard, containsWordForm, editDistance, quizStageOf, validateQuizQuestion } from "./quiz";
import { studyConfigOf } from "./queue";
import { DEFAULT_STUDY_CONFIG, type StudyConfig, type StudySrs } from "./types";

function sense(id: string, translation: string, definition = "", pos = "n."): SenseItem {
  return {
    id,
    pos,
    translation,
    definition,
    examples: [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  };
}

function srs(patch: Partial<StudySrs> = {}): StudySrs {
  return {
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    learningSteps: 0,
    ...patch,
  };
}

function mk(id: string, word: string, translation: string, opts: { def?: string; pos?: string; srs?: StudySrs } = {}): Entry {
  return makeEntry({
    id,
    headword: word,
    values: { senses: [sense(`s-${id}`, translation, opts.def ?? "", opts.pos ?? "n.")] },
    ...(opts.srs ? { srs: opts.srs } : {}),
  });
}

const pool: Entry[] = [
  mk("a", "abandon", "抛弃；遗弃"),
  mk("b", "ability", "能力；才能"),
  mk("c", "calendar", "日历；日程表"),
  mk("d", "harvest", "收获；收割"),
  mk("e", "tunnel", "隧道；地道"),
  mk("f", "orbit", "轨道；运行"),
];

describe("工具函数", () => {
  it("editDistance 小词距离与 bigramJaccard 语义重叠", () => {
    expect(editDistance("abandon", "abandoned", 2)).toBeLessThanOrEqual(2);
    expect(editDistance("calendar", "tunnel", 3)).toBeGreaterThan(3);
    expect(bigramJaccard("抛弃；遗弃", "遗弃；抛弃")).toBeGreaterThanOrEqual(0.6);
    expect(bigramJaccard("抛弃；遗弃", "轨道；运行")).toBeLessThan(0.2);
  });

  it("quizStageOf：无 srs 视为 learning；Review 且间隔 ≥10 天为 stable", () => {
    expect(quizStageOf(pool[0])).toBe("learning");
    expect(quizStageOf(mk("r", "ridge", "山脊", { srs: srs({ state: 2, scheduledDays: 3 }) }))).toBe("review");
    expect(quizStageOf(mk("s", "ridge", "山脊", { srs: srs({ state: 2, scheduledDays: 12 }) }))).toBe("stable");
  });
});

describe("buildQuizQuestion 题型挑选与降级", () => {
  it("zh2word：隐藏词头、线索为中文释义、选项为英文词", () => {
    const target = pool[0];
    const q = buildQuizQuestion(target, pool, { kinds: ["zh2word"], seed: "t1" });
    expect(q).toBeTruthy();
    expect(q!.kind).toBe("zh2word");
    expect(q!.hideWord).toBe(true);
    expect(q!.clue).toContain("抛弃");
    expect(q!.options).toHaveLength(4);
    expect(q!.options.some((o) => o.text === "abandon" && o.correct)).toBe(true);
    expect(q!.options.find((o) => o.correct)!.text).toBe("abandon");
  });

  it("def2word：stable 词带英英释义时优先出；缺释义自动降级到 zh2word", () => {
    const stable = mk("w1", "wander", "漫步；闲逛", {
      def: "to walk slowly around a place without a clear direction",
      srs: srs({ state: 2, scheduledDays: 30 }),
    });
    const book = [stable, ...pool.slice(1)];
    const q = buildQuizQuestion(stable, book, { seed: "t2" });
    expect(q!.kind).toBe("def2word");
    expect(q!.clue).toContain("walk slowly");

    const noDef = mk("w2", "wander", "漫步；闲逛", { srs: srs({ state: 2, scheduledDays: 30 }) });
    const q2 = buildQuizQuestion(noDef, [noDef, ...pool.slice(1)], { seed: "t3" });
    expect(q2!.kind).toBe("zh2word");
  });

  it("kinds 过滤与全不可用回退 null", () => {
    const q = buildQuizQuestion(pool[0], pool, { kinds: ["word2zh"], seed: "t4" });
    expect(q!.kind).toBe("word2zh");
    expect(q!.hideWord).toBe(false);

    const tiny = [mk("x", "sun", "太阳"), mk("y", "moon", "月亮")];
    expect(buildQuizQuestion(tiny[0], tiny)).toBeNull();
  });

  it("word2def：显示英文词，四个英文释义，最多两个易混项", () => {
    const target = mk("empirical", "empirical", "以实验为依据的", {
      def: "based on experiments or direct experience rather than ideas or theories",
      pos: "adj.",
    });
    const book = [
      target,
      mk("theoretical", "theoretical", "理论上的", { def: "based on ideas or theories rather than practical observation", pos: "adj." }),
      mk("practical", "practical", "实际的", { def: "connected with real situations rather than abstract ideas", pos: "adj." }),
      mk("visible", "visible", "可见的", { def: "able to be seen with the eyes", pos: "adj." }),
      mk("careful", "careful", "小心的", { def: "giving attention so that mistakes are avoided", pos: "adj." }),
    ];
    const q = buildQuizQuestion(target, book, { kinds: ["word2def"], seed: "wq-def" });
    expect(q).toBeTruthy();
    expect(q!.kind).toBe("word2def");
    expect(q!.hideWord).toBe(false);
    expect(q!.options).toHaveLength(4);
    expect(q!.options.filter((o) => o.role === "confusable").length).toBeLessThanOrEqual(2);
    expect(q!.options.find((o) => o.correct)!.text).toContain("experiments");
    expect(containsWordForm(q!.options.find((o) => o.correct)!.text, "empirical")).toBe(false);
  });

  it("def2word：英文释义含目标词时拒收，避免词形泄底", () => {
    const target = mk("leak", "leak", "泄漏", { def: "to allow liquid or gas to leak out", pos: "v." });
    const book = [
      target,
      mk("flow", "flow", "流动", { def: "to move steadily in one direction", pos: "v." }),
      mk("pour", "pour", "倾倒", { def: "to make liquid flow from a container", pos: "v." }),
      mk("drop", "drop", "落下", { def: "to fall or let something fall", pos: "v." }),
    ];
    expect(buildQuizQuestion(target, book, { kinds: ["def2word"] })).toBeNull();
  });

  it("validateQuizQuestion：拒绝多解、重复项与超过两个易混项", () => {
    const expected = { word: "leak", pos: "v.", kind: "zh2word" as const, translation: "泄漏" };
    const valid = {
      kind: "zh2word",
      clue: "泄漏",
      options: [
        { text: "leak", correct: true, role: "correct" },
        { text: "pour", correct: false, role: "confusable", note: "pour 强调倾倒，leak 强调意外漏出" },
        { text: "flow", correct: false, role: "contrast" },
        { text: "drop", correct: false, role: "contrast" },
      ],
    };
    expect(validateQuizQuestion(valid, expected)?.correctIndex).toBe(0);
    expect(validateQuizQuestion({ ...valid, options: [valid.options[0], valid.options[1], valid.options[2], valid.options[0]] }, expected)).toBeNull();
    expect(validateQuizQuestion({
      ...valid,
      options: valid.options.map((option, index) => ({ ...option, correct: index < 2 })),
    }, expected)).toBeNull();
  });

  it("四子型默认作答时长为 30 / 20 / 15 / 15 秒", () => {
    expect(studyConfigOf(createEmptyBook("测试词库")).choiceTimeLimits).toEqual({
      word2def: 30,
      def2word: 20,
      zh2word: 15,
      word2zh: 15,
    });
  });

  it.each([undefined, 15] as const)("旧配置缺省或使用统一默认 %s 秒时采用新默认", (choiceTimeLimit) => {
    const book = createEmptyBook("测试词库");
    book.study = { config: { choiceTimeLimit } as StudyConfig, daily: {} };
    expect(studyConfigOf(book).choiceTimeLimits).toEqual(DEFAULT_STUDY_CONFIG.choiceTimeLimits);
  });

  it.each([10, 25] as const)("旧配置明确选择统一 %s 秒时迁移到全部子型", (choiceTimeLimit) => {
    const book = createEmptyBook("测试词库");
    book.study = { config: { choiceTimeLimit } as StudyConfig, daily: {} };
    expect(studyConfigOf(book).choiceTimeLimits).toEqual({
      word2def: choiceTimeLimit,
      def2word: choiceTimeLimit,
      zh2word: choiceTimeLimit,
      word2zh: choiceTimeLimit,
    });
  });

  it("已有子型时长优先，缺失项兼容旧值，非法值回退默认", () => {
    const book = createEmptyBook("测试词库");
    book.study = {
      config: {
        choiceTimeLimit: 10,
        choiceTimeLimits: { word2def: 30, def2word: 99 },
      } as unknown as StudyConfig,
      daily: {},
    };
    expect(studyConfigOf(book).choiceTimeLimits).toEqual({
      word2def: 30,
      def2word: 10,
      zh2word: 10,
      word2zh: 10,
    });
  });

  it("studyConfigOf 保留 word2def 并净化作答时限", () => {
    const book = createEmptyBook("测试词库");
    book.study = {
      config: {
        ...DEFAULT_STUDY_CONFIG,
        choiceTypes: ["word2def", "word2zh", "cloze"] as unknown as StudyConfig["choiceTypes"],
        choiceTimeLimit: 99 as StudyConfig["choiceTimeLimit"],
      },
      daily: {},
    };
    const cfg = studyConfigOf(book);
    expect(cfg.choiceTypes).toEqual(["word2def", "word2zh"]);
    expect(cfg.choiceTimeLimit).toBe(15);
  });
});
