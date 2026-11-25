import type { Entry } from "../types";
import { choiceKindsForStage } from "./quiz";
import {
  DEFAULT_STUDY_CONFIG,
  type ChoiceMixWeights,
  type ChoiceQuizKind,
  type QuizFamily,
  type QuizMixWeights,
  type StudyConfig,
} from "./types";

const FAMILIES: QuizFamily[] = ["flip", "choice", "cloze"];
const KINDS: ChoiceQuizKind[] = ["word2def", "word2zh", "zh2word", "def2word"];

function weight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeQuizMixWeights(value: Partial<QuizMixWeights> | undefined): QuizMixWeights {
  return {
    flip: weight(value?.flip),
    choice: weight(value?.choice),
    cloze: weight(value?.cloze),
  };
}

export function normalizeChoiceMixWeights(value: Partial<ChoiceMixWeights> | undefined): ChoiceMixWeights {
  return {
    word2def: weight(value?.word2def),
    word2zh: weight(value?.word2zh),
    zh2word: weight(value?.zh2word),
    def2word: weight(value?.def2word),
  };
}

export function quizMixOf(cfg: StudyConfig): QuizMixWeights {
  return normalizeQuizMixWeights(cfg.quizMixWeights ?? DEFAULT_STUDY_CONFIG.quizMixWeights);
}

export function choiceMixOf(cfg: StudyConfig): ChoiceMixWeights {
  return normalizeChoiceMixWeights(cfg.choiceMixWeights ?? DEFAULT_STUDY_CONFIG.choiceMixWeights);
}

export function mixPercentages<T extends object>(value: T & Record<keyof T, number>): Record<string, number> {
  const entries = Object.values(value) as number[];
  const total = entries.reduce((sum, item) => sum + item, 0);
  if (!total) return Object.fromEntries(Object.keys(value).map((key) => [key, 0]));
  return Object.fromEntries(entries.map((item, index) => [Object.keys(value)[index], Math.round(item / total * 100)]));
}

/**
 * 平滑加权轮转：每一步选择「目标累计 minus 已选次数」最大的可用项。
 * 同一配置与序号得到同一结果，既贴合比例，也不会连续随机堆在同一题型。
 */
function pickWeighted<T extends string>(order: T[], weights: Record<T, number>, turn: number, used?: Partial<Record<T, number>>): T | null {
  if (used === undefined) {
    const simulated: Partial<Record<T, number>> = {};
    for (let i = 0; i < turn; i += 1) {
      const key = pickWeighted(order, weights, i, simulated);
      if (key) simulated[key] = (simulated[key] ?? 0) + 1;
    }
    used = simulated;
  }
  const eligible = order.filter((key) => weights[key] > 0);
  if (!eligible.length) return null;
  const total = eligible.reduce((sum, key) => sum + weights[key], 0);
  let picked = eligible[0];
  let best = -Infinity;
  for (const key of eligible) {
    const target = (turn + 1) * weights[key] / total;
    const deficit = target - (used[key] ?? 0);
    if (deficit > best + 1e-9) {
      best = deficit;
      picked = key;
    }
  }
  return picked;
}

export interface QuizPlan { family: QuizFamily; choiceKind?: ChoiceQuizKind }

/** 新词验证由调用方固定处理；这里只规划普通复习与稳定期题目。 */
export function planQuiz(
  cfg: StudyConfig,
  entry: Entry,
  turn: number,
  used?: { families: Partial<Record<QuizFamily, number>>; kinds: Partial<Record<ChoiceQuizKind, number>> },
  choiceTurn = turn,
): QuizPlan {
  if (cfg.quizMode === "flip") return { family: "flip" };
  if (cfg.quizMode === "choice") {
    const choiceKind = pickChoiceKind(cfg, entry, choiceTurn, used?.kinds);
    return choiceKind ? { family: "choice", choiceKind } : { family: "flip" };
  }
  if (cfg.quizMode === "cloze") return { family: cfg.clozeEnabled === false ? "flip" : "cloze" };

  const eligible: QuizFamily[] = ["flip"];
  if (cfg.choiceTypes.length && choiceKindsForStage(entry, cfg.choiceTypes).length) eligible.push("choice");
  if (cfg.clozeEnabled !== false) eligible.push("cloze");
  const weights = quizMixOf(cfg);
  const family = pickWeighted(FAMILIES, weights, turn, used?.families) ?? "flip";
  if (!eligible.includes(family)) return { family: "flip" };
  return { family, ...(family === "choice" ? { choiceKind: pickChoiceKind(cfg, entry, choiceTurn, used?.kinds) ?? undefined } : {}) };
}

export function pickChoiceKind(
  cfg: StudyConfig,
  entry: Entry,
  turn: number,
  used?: Partial<Record<ChoiceQuizKind, number>>,
): ChoiceQuizKind | null {
  const eligible = choiceKindsForStage(entry, cfg.choiceTypes);
  if (!eligible.length) return null;
  const weights = choiceMixOf(cfg);
  const availableWeights = Object.fromEntries(KINDS.map((kind) => [kind, eligible.includes(kind) ? weights[kind] : 0])) as ChoiceMixWeights;
  return pickWeighted(KINDS, availableWeights, turn, used);
}
