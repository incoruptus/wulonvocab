import type { Entry, SenseItem } from "../types";
import type { QuizKind } from "./types";

/**
 * 选择题生成（纯函数，可单测）
 * ------------------------------------------------------------------
 * 三种题型：
 * - word2zh  看词选义（原模式）：正面显示单词，四个中文释义
 * - zh2word  看义选词：正面显示中文释义，四个英文词（隐藏词头）
 * - def2word 看释义选词：正面显示英英释义（需词条带 definition），四个英文词（隐藏词头）
 * 题型按词的学习阶段自动挑选（学习中→识别型；巩固稳定后→产出型线索），
 * 缺数据或干扰项不足自动沿顺序降级；全部不可用返回 null（该卡回退翻卡）。
 * 种子固定，同一词重复出现时选项顺序稳定（洗牌袋由调用处接管）。
 */

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  word: string;
  kind: QuizKind;
  options: QuizOption[];
  correctIndex: number;
  pos: string;
  /** 隐藏词头时显示在正面的线索（zh2word=中文释义；def2word=英英释义） */
  clue?: string;
  /** 正面是否隐藏词头（避免朗读/视觉泄底） */
  hideWord: boolean;
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

/** 词条的首个非空英英释义 */
export function firstDefinition(entry: Entry): { text: string; pos: string } | null {
  const senses = entry.values["senses"];
  if (!Array.isArray(senses)) return null;
  for (const sense of senses as SenseItem[]) {
    const text = (sense?.definition ?? "").trim();
    if (text) return { text, pos: (sense?.pos ?? "").trim() };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 字符 bigram Jaccard 相似度（0-1；免分词器，中英通用） */
export function bigramJaccard(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    const set = new Set<string>();
    for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  return inter / (ga.size + gb.size - inter);
}

/** 小规模编辑距离（提前截断，用于词形相近判定） */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[n];
}

/** 学习阶段（决定题型排序）：learning 识别优先；review 过渡；stable（间隔 ≥10 天）产出线索优先 */
export function quizStageOf(entry: Entry): "learning" | "review" | "stable" {
  const srs = entry.srs;
  if (!srs || (srs.state !== 2 && srs.state !== 3)) return "learning";
  return (srs.scheduledDays ?? 0) >= 10 ? "stable" : "review";
}

const KIND_ORDER: Record<ReturnType<typeof quizStageOf>, QuizKind[]> = {
  learning: ["word2zh", "zh2word"],
  review: ["zh2word", "word2zh"],
  stable: ["def2word", "zh2word", "word2zh"],
};

/** word2zh：正面显示词，四个中文释义 */
function buildWord2Zh(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number },
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
  const uniqueOptions = options.slice(0, 4);
  const currentCorrect = uniqueOptions.findIndex((o) => o.correct);
  const target = opts.forceCorrectIndex;
  if (target !== undefined && target >= 0 && target < uniqueOptions.length && currentCorrect !== target) {
    [uniqueOptions[currentCorrect], uniqueOptions[target]] = [uniqueOptions[target], uniqueOptions[currentCorrect]];
  }
  return {
    word: entry.headword,
    kind: "word2zh",
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: correct.pos,
    hideWord: false,
  };
}

/** zh2word / def2word：正面给线索（隐藏词头），四个英文词 */
function buildWordChoice(
  kind: "zh2word" | "def2word",
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number },
): QuizQuestion | null {
  const clueInfo = kind === "zh2word" ? firstTranslation(entry) : firstDefinition(entry);
  if (!clueInfo?.text) return null;

  const rng = mulberry32(hashSeed(`${opts.seed ?? entry.id}:${kind}`));
  const target = entry.headword.trim();
  const targetNorm = norm(target);
  const isBadWord = (w: string): boolean => {
    const c = norm(w);
    if (!c || c === targetNorm || c.includes(targetNorm) || targetNorm.includes(c)) return true;
    // 词形太近（差 1 个字符）不做干扰项：无意义的拼写题
    return target.length >= 4 && c.length >= 4 && editDistance(target.toLowerCase(), w.toLowerCase(), 2) <= 1;
  };

  const candidates: { word: string; pos: string; gloss: string }[] = [];
  for (const other of pool) {
    if (other.id === entry.id) continue;
    const w = other.headword.trim();
    if (isBadWord(w)) continue;
    const t = firstTranslation(other);
    const d = firstDefinition(other);
    const gloss = (kind === "zh2word" ? t?.text : d?.text) ?? "";
    // 干扰词自身与线索含义太像 → 可能也成立，剔除
    if (gloss && bigramJaccard(gloss, clueInfo.text) >= 0.6) continue;
    if (candidates.some((x) => norm(x.word) === norm(w))) continue;
    candidates.push({ word: w, pos: t?.pos ?? d?.pos ?? "", gloss });
  }

  const samePos = candidates.filter((x) => x.pos && clueInfo.pos && x.pos === clueInfo.pos);
  let primary = samePos.length >= 3 ? samePos : candidates;
  primary = [...primary].sort(
    (a, b) => Math.abs(a.word.length - target.length) - Math.abs(b.word.length - target.length),
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
    if (!picked.includes(x.word)) picked.push(x.word);
  }
  if (picked.length < 3) {
    for (const x of candidates) {
      if (picked.length >= 3) break;
      if (!picked.includes(x.word)) picked.push(x.word);
    }
  }
  if (picked.length < 3) return null;

  const options: QuizOption[] = [
    { text: target, correct: true },
    ...picked.slice(0, 3).map((w) => ({ text: w, correct: false })),
  ];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const uniqueOptions = options.slice(0, 4);
  const currentCorrect = uniqueOptions.findIndex((o) => o.correct);
  const force = opts.forceCorrectIndex;
  if (force !== undefined && force >= 0 && force < uniqueOptions.length && currentCorrect !== force) {
    [uniqueOptions[currentCorrect], uniqueOptions[force]] = [uniqueOptions[force], uniqueOptions[currentCorrect]];
  }
  return {
    word: target,
    kind,
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: clueInfo.pos,
    clue: clueInfo.text,
    hideWord: true,
  };
}

/** 按学习阶段与启用题型挑题；缺数据沿顺序降级；全不可用返回 null（回退翻卡） */
export function buildQuizQuestion(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number; kinds?: QuizKind[] } = {},
): QuizQuestion | null {
  const enabled = opts.kinds?.length ? opts.kinds : (["word2zh", "zh2word", "def2word"] as QuizKind[]);
  const order = KIND_ORDER[quizStageOf(entry)].filter((k) => enabled.includes(k));
  for (const kind of order) {
    const q = kind === "word2zh" ? buildWord2Zh(entry, pool, opts) : buildWordChoice(kind, entry, pool, opts);
    if (q) return q;
  }
  return null;
}

/** 兼容旧调用：等价于仅 word2zh */
export function buildQuizOptions(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number } = {},
): QuizQuestion | null {
  return buildWord2Zh(entry, pool, opts);
}
