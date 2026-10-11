import { describe, expect, it } from "vitest";
import {
  CHOICE_KEY_PRESETS,
  choiceKeyPresetOf,
  DEFAULT_CHOICE_KEYS,
  normalizeChoiceKeys,
  validateChoiceKeys,
} from "./keys";

describe("validateChoiceKeys", () => {
  it("合法四键通过并统一小写；ABCD 预设可用", () => {
    expect(validateChoiceKeys(["A", "B", "C", "D"])).toEqual({ ok: true, keys: ["a", "b", "c", "d"] });
    expect(validateChoiceKeys([...CHOICE_KEY_PRESETS.weio]).ok).toBe(true);
  });

  it("数量 / 非字母 / 重复 / 保留键冲突都给出中文错误", () => {
    expect(validateChoiceKeys(["a", "b", "c"]).ok).toBe(false);
    expect(validateChoiceKeys(["a", "b", "c", "1"]).ok).toBe(false);
    expect(validateChoiceKeys(["a", "b", "c", "a"]).ok).toBe(false);
    const clash = validateChoiceKeys(["a", "b", "c", "f"]);
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error).toContain("F");
  });
});

describe("normalizeChoiceKeys / preset 识别", () => {
  it("损坏值回退 WEIO；合法值原样返回", () => {
    expect(normalizeChoiceKeys(undefined)).toEqual([...DEFAULT_CHOICE_KEYS]);
    expect(normalizeChoiceKeys(["x", "x", "y", "z"])).toEqual([...DEFAULT_CHOICE_KEYS]);
    expect(normalizeChoiceKeys(["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("预设识别", () => {
    expect(choiceKeyPresetOf(["w", "e", "i", "o"])).toBe("weio");
    expect(choiceKeyPresetOf(["a", "b", "c", "d"])).toBe("abcd");
    expect(choiceKeyPresetOf(["q", "p", "z", "m"])).toBe("custom");
  });
});
