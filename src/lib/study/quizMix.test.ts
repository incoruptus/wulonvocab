import { describe, expect, it } from "vitest";
import { createSampleBook } from "../presets";
import { planQuiz, pickChoiceKind, quizMixOf } from "./quizMix";
import { DEFAULT_STUDY_CONFIG, type StudyConfig } from "./types";

const entry = createSampleBook().entries[0];
const config = (patch: Partial<StudyConfig> = {}): StudyConfig => ({
  ...DEFAULT_STUDY_CONFIG,
  choiceTypes: [...DEFAULT_STUDY_CONFIG.choiceTypes],
  quizMixWeights: { ...DEFAULT_STUDY_CONFIG.quizMixWeights! },
  choiceMixWeights: { ...DEFAULT_STUDY_CONFIG.choiceMixWeights! },
  ...patch,
});

describe("混搭学习调度", () => {
  it("独立模式不受混搭比例影响", () => {
    expect(planQuiz(config({ quizMode: "cloze" }), entry, 0).family).toBe("cloze");
    expect(planQuiz(config({ quizMode: "choice", quizMixWeights: { flip: 100, choice: 0, cloze: 0 } }), entry, 0).family).toBe("choice");
    expect(planQuiz(config({ quizMode: "flip" }), entry, 99).family).toBe("flip");
  });

  it("按 1:1 比例稳定轮转，不依赖随机数", () => {
    const cfg = config({ quizMode: "mix", quizMixWeights: { flip: 1, choice: 1, cloze: 0 }, clozeEnabled: false });
    expect(Array.from({ length: 8 }, (_, i) => planQuiz(cfg, entry, i).family)).toEqual([
      "flip", "choice", "flip", "choice", "flip", "choice", "flip", "choice",
    ]);
  });

  it("20:60:20 在 50 次内贴近设定比例", () => {
    const cfg = config({ quizMode: "mix" });
    const used = { families: {} as Record<string, number>, kinds: {} };
    for (let i = 0; i < 50; i += 1) {
      const family = planQuiz(cfg, entry, i, used).family;
      used.families[family] = (used.families[family] ?? 0) + 1;
    }
    expect(used.families).toEqual({ flip: 10, choice: 30, cloze: 10 });
  });

  it("全部权重为 0 或题型缺数据时安全回退自评", () => {
    expect(planQuiz(config({ quizMode: "mix", quizMixWeights: { flip: 0, choice: 0, cloze: 0 } }), entry, 0).family).toBe("flip");
    expect(planQuiz(config({ quizMode: "mix", choiceTypes: [] }), entry, 0).family).not.toBe("choice");
  });

  it("选择题子型按权重规划并尊重阶段可用性", () => {
    const cfg = config({ choiceMixWeights: { word2def: 0, word2zh: 1, zh2word: 0, def2word: 0 } });
    expect(pickChoiceKind(cfg, entry, 0)).toBe("word2zh");
    expect(quizMixOf(config()).choice).toBe(60);
  });

  it("独立选择题只启用学习期不可用子型时回退自评", () => {
    const cfg = config({ quizMode: "choice", choiceTypes: ["def2word"] });
    expect(entry.srs).toBeUndefined();
    expect(planQuiz(cfg, entry, 0)).toEqual({ family: "flip" });
  });

  it("选择题子型使用独立轮转序号，50 次内保持 2:1:1", () => {
    const cfg = config({ quizMode: "choice", choiceTypes: ["word2def", "word2zh", "zh2word", "def2word"], choiceMixWeights: { word2def: 2, word2zh: 1, zh2word: 1, def2word: 0 } });
    const used = { families: {}, kinds: {} as Record<string, number> };
    for (let i = 0; i < 50; i += 1) {
      const kind = planQuiz(cfg, entry, i * 3, used, i).choiceKind!;
      used.kinds[kind] = (used.kinds[kind] ?? 0) + 1;
    }
    expect(used.kinds).toEqual({ word2def: 25, word2zh: 13, zh2word: 12 });
  });

  it("Cloze 关闭时独立模式回退自评", () => {
    expect(planQuiz(config({ quizMode: "cloze", clozeEnabled: false }), entry, 0).family).toBe("flip");
  });
});
