import type { Entry, SenseItem } from "../types";

/**
 * 看词选义选择题生成（纯函数，可单测）
 * ------------------------------------------------------------------
 * - 正确项：词条第一个非空中文释义
 * - 干扰项：同书其它词条的释义；优先同词性；排除「相等 / 互相包含」；
 *   按长度接近排序后随机抽取；候选不足 3 个时返回 null（该卡回退翻卡模式）
 * - 种子固定（词条 id），同一词重复出现时选项顺序稳定；如需变化可在调用处传入 seed
 */

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  word: string;
  options: QuizOption[];
  correctIndex: number;
  pos: string;
}

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 词条的首个非空中文释义 */
export function firstTranslation(entry: Entry): { text: string; pos: string } | null {
  const senses = entry.values["senses"];
  if (!Array.isArray(senses)) return null;
  for (const sense of senses as SenseItem[]) {
    const text = (sense?.translation ?? "").trim();
    if (text) return { text, pos: (sense?.pos ?? "").trim() };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function buildQuizOptions(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number } = {},
): QuizQuestion | null {
  const correct = firstTranslation(entry);
  if (!correct) return null;

  const rng = mulberry32(hashSeed(opts.seed ?? entry.id));
  const correctNorm = norm(correct.text);
  const isBad = (cand: string): boolean => {
    const c = norm(cand);
    return !c || c === correctNorm || c.includes(correctNorm) || correctNorm.includes(c);
  };

  const candidates: { text: string; pos: string }[] = [];
  for (const other of pool) {
    if (other.id === entry.id) continue;
    const t = firstTranslation(other);
    if (!t || isBad(t.text)) continue;
    if (candidates.some((x) => norm(x.text) === norm(t.text))) continue;
    candidates.push(t);
  }

  const samePos = candidates.filter((x) => x.pos && correct.pos && x.pos === correct.pos);
  let primary = samePos.length >= 3 ? samePos : candidates;

  // 按长度接近排序，取前若干再随机抽样（兼顾“混淆度”与多样性）
  primary = [...primary].sort(
    (a, b) =>
      Math.abs(norm(a.text).length - correctNorm.length) - Math.abs(norm(b.text).length - correctNorm.length),
  );
  const top = primary.slice(0, Math.max(8, 12));
  const shuffled = [...top];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked: string[] = [];
  for (const x of shuffled) {
    if (picked.length >= 3) break;
    if (!picked.includes(x.text)) picked.push(x.text);
  }
  if (picked.length < 3) {
    for (const x of candidates) {
      if (picked.length >= 3) break;
      if (!picked.includes(x.text)) picked.push(x.text);
    }
  }
  if (picked.length < 3) return null;

  const options: QuizOption[] = [
    { text: correct.text, correct: true },
    ...picked.slice(0, 3).map((text) => ({ text, correct: false })),
  ];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  // 洗牌袋：把正确项换到指定位置（会话内保证正确项位置大致均匀，防止位置记忆）
  const uniqueOptions = options.slice(0, 4);
  const currentCorrect = uniqueOptions.findIndex((o) => o.correct);
  const target = opts.forceCorrectIndex;
  if (target !== undefined && target >= 0 && target < uniqueOptions.length && currentCorrect !== target) {
    [uniqueOptions[currentCorrect], uniqueOptions[target]] = [uniqueOptions[target], uniqueOptions[currentCorrect]];
  }
  return {
    word: entry.headword,
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: correct.pos,
  };
}
