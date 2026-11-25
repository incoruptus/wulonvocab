import { describe, expect, it } from "vitest";
import { transitionNewWord } from "./newWordFlow";

describe("three-step new word flow", () => {
  it("没印象先回教学卡，再进入回忆，不产生熟悉感评分", () => {
    expect(transitionNewWord("present", "unfamiliar")).toEqual({ step: "teaching" });
    expect(transitionNewWord("teaching", "learned")).toEqual({ step: "recall" });
    expect(transitionNewWord("present", "unfamiliar").rating).toBeUndefined();
  });

  it("有印象进入再认；正确封顶 Hard，错误 Again 并回教学卡", () => {
    expect(transitionNewWord("present", "familiar")).toEqual({ step: "recognition" });
    expect(transitionNewWord("recognition", "recognized")).toEqual({ step: "done", rating: 2 });
    expect(transitionNewWord("recognition", "not-recognized")).toEqual({ step: "teaching", rating: 1 });
  });

  it("回忆阶段只有 Good/Hard/Again，不提供 Easy", () => {
    expect(transitionNewWord("recall", "recall-good")).toEqual({ step: "done", rating: 3 });
    expect(transitionNewWord("recall", "recall-hard")).toEqual({ step: "done", rating: 2 });
    expect(transitionNewWord("recall", "recall-again")).toEqual({ step: "done", rating: 1 });
  });

  it("干扰项不足时回退到回忆自评", () => {
    expect(transitionNewWord("recognition", "fallback-recall")).toEqual({ step: "recall" });
  });

  it("非法阶段动作不改变状态", () => {
    expect(transitionNewWord("teaching", "recognized")).toEqual({ step: "teaching" });
    expect(transitionNewWord("present", "recall-good")).toEqual({ step: "present" });
  });
});
