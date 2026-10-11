/**
 * 选择题直选键位（可切换 WEIO / ABCD / 自定义）
 * ------------------------------------------------------------
 * - 校验规则：恰好 4 个、单个英文字母、互不重复、避开会话保留键；
 * - 保留键 = 会话通用/导航（F/J 上下一词、R 朗读、S 星标、U 撤销）；
 * - 存 `AppSettings.choiceKeys`（同步键）；读取一律经 `normalizeChoiceKeys` 容错。
 */

export const DEFAULT_CHOICE_KEYS: readonly [string, string, string, string] = ["w", "e", "i", "o"];

export const CHOICE_KEY_PRESETS: Record<"weio" | "abcd", [string, string, string, string]> = {
  weio: ["w", "e", "i", "o"],
  abcd: ["a", "b", "c", "d"],
};

/** 会话保留键（不得作为选项直选键） */
export const RESERVED_CHOICE_KEYS: readonly string[] = ["f", "j", "r", "s", "u"];

export type ChoiceKeys = [string, string, string, string];

export function validateChoiceKeys(draft: string[]): { ok: true; keys: ChoiceKeys } | { ok: false; error: string } {
  if (draft.length !== 4) return { ok: false, error: "需要正好 4 个键位" };
  const keys = draft.map((k) => k.trim().toLowerCase());
  if (keys.some((k) => !/^[a-z]$/.test(k))) return { ok: false, error: "每个键位须为单个英文字母" };
  if (new Set(keys).size !== 4) return { ok: false, error: "四个键位不能重复" };
  const clash = keys.find((k) => RESERVED_CHOICE_KEYS.includes(k));
  if (clash) return { ok: false, error: `「${clash.toUpperCase()}」与会话键冲突（F / J / R / S / U 为保留键）` };
  return { ok: true, keys: keys as ChoiceKeys };
}

/** 任意来源（旧设置/损坏值）→ 合法键位；非法回退 WEIO */
export function normalizeChoiceKeys(raw: unknown): ChoiceKeys {
  if (Array.isArray(raw)) {
    const res = validateChoiceKeys(raw.map((x) => String(x ?? "")));
    if (res.ok) return res.keys;
  }
  return [...DEFAULT_CHOICE_KEYS];
}

/** 当前键位匹配哪套预设（用于设置页高亮；自定义返回 "custom"） */
export function choiceKeyPresetOf(keys: ChoiceKeys): "weio" | "abcd" | "custom" {
  const s = keys.join("");
  if (s === CHOICE_KEY_PRESETS.weio.join("")) return "weio";
  if (s === CHOICE_KEY_PRESETS.abcd.join("")) return "abcd";
  return "custom";
}
