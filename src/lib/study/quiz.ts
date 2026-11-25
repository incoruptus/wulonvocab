import type { Entry, SenseItem } from "../types";
import type { ChoiceQuizKind, QuizKind } from "./types";

/**
 * Word Quiz 四选一生成（纯函数，可单测）
 * ------------------------------------------------------------------
 * 四种题型：
 * - word2def  看英文词选英文释义
 * - def2word  看英文释义选英文词（隐藏词头）
 * - zh2word   看中文释义选英文词（隐藏词头）
 * - word2zh   看英文词选中文释义
 * 每题固定四个选项，最多两个真正易混项，其余为对照项。
 * 题型按词的学习阶段自动挑选，缺数据或选项不足自动降级；全部不可用返回 null。
 * 种子固定，同一词重复出现时选项顺序稳定（洗牌袋由调用处接管）。
 */

export type { ChoiceQuizKind } from "./types";

export interface QuizOption {
  text: string;
  correct: boolean;
  /** 易混项最多两个；其余选项必须是对照项。 */
  role: "correct" | "confusable" | "contrast";
  /** 公共题库或 AI 可提供与正确项的关键差异。 */
  note?: string;
}

export interface QuizQuestion {
  word: string;
  kind: ChoiceQuizKind;
  options: QuizOption[];
  correctIndex: number;
  pos: string;
  /** 隐藏词头时显示在正面的线索（zh2word=中文释义；def2word=英英释义） */
  clue?: string;
  /** 正面是否隐藏词头（避免朗读/视觉泄底） */
  hideWord: boolean;
  /** 题目供给来源，用于界面质量提示与社区贡献。 */
  source?: "entry" | "ai" | "shared";
  /** 公共题库稳定 ID；举报与纠错时使用。 */
  sharedId?: string;
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

/** 常见词形集合，用于避免英文释义直接泄露目标词。 */
function wordForms(word: string): Set<string> {
  const w = word.trim().toLowerCase();
  const forms = new Set([w]);
  if (!w) return forms;
  forms.add(`${w}s`);
  forms.add(`${w}es`);
  forms.add(`${w}d`);
  forms.add(`${w}ed`);
  forms.add(`${w}ing`);
  forms.add(`${w}ly`);
  if (w.endsWith("e")) forms.add(`${w.slice(0, -1)}ing`);
  if (w.endsWith("y")) forms.add(`${w.slice(0, -1)}ies`);
  if (/([bdfgklmnprt])\1$/.test(w)) forms.add(`${w}${w.at(-1)}ing`);
  return forms;
}

export function containsWordForm(text: string, word: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  const forms = wordForms(word);
  return tokens.some((token) => forms.has(token));
}

function usableDefinition(text: string, word: string): boolean {
  const value = text.trim();
  if (!value || value.includes("\n") || containsWordForm(value, word)) return false;
  return value.split(/\s+/).length <= 24;
}

function shuffleOptions(options: QuizOption[], rng: () => number, forceCorrectIndex?: number): QuizOption[] {
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const currentCorrect = options.findIndex((o) => o.correct);
  if (forceCorrectIndex !== undefined && forceCorrectIndex >= 0 && forceCorrectIndex < options.length && currentCorrect !== forceCorrectIndex) {
    [options[currentCorrect], options[forceCorrectIndex]] = [options[forceCorrectIndex], options[currentCorrect]];
  }
  return options;
}

/** 最多把两个同词性且线索相近的选项标为易混项，其余保持对照项。 */
function markDistractorRoles(
  correctText: string,
  picked: Array<{ text: string; pos: string; gloss: string }>,
  correctPos: string,
): QuizOption[] {
  let confusable = 0;
  return picked.map((item) => {
    const samePos = Boolean(correctPos && item.pos && item.pos === correctPos);
    const closeGloss = Boolean(item.gloss && bigramJaccard(item.gloss, correctText) >= 0.25);
    const role = samePos && closeGloss && confusable < 2 ? "confusable" : "contrast";
    if (role === "confusable") confusable += 1;
    return { text: item.text, correct: false, role };
  });
}

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

const KIND_ORDER: Record<ReturnType<typeof quizStageOf>, ChoiceQuizKind[]> = {
  learning: ["word2zh", "word2def", "zh2word"],
  review: ["zh2word", "word2def", "word2zh"],
  stable: ["word2def", "def2word", "zh2word", "word2zh"],
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

  const candidates: { text: string; pos: string; gloss: string }[] = [];
  for (const other of pool) {
    if (other.id === entry.id) continue;
    const t = firstTranslation(other);
    if (!t || isBad(t.text)) continue;
    if (candidates.some((x) => norm(x.text) === norm(t.text))) continue;
    candidates.push({ text: t.text, pos: t.pos, gloss: t.text });
  }

  const samePos = candidates.filter((x) => x.pos && correct.pos && x.pos === correct.pos);
  const primary = (correct.pos ? (samePos.length >= 3 ? samePos : []) : candidates)
    .sort((a, b) =>
      Math.abs(norm(a.text).length - correctNorm.length) - Math.abs(norm(b.text).length - correctNorm.length),
    );
  if (primary.length < 3) return null;
  const top = primary.slice(0, Math.max(8, 12));
  const shuffled = [...top];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked: typeof candidates = [];
  for (const x of shuffled) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => norm(item.text) === norm(x.text))) picked.push(x);
  }
  for (const x of primary) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => norm(item.text) === norm(x.text))) picked.push(x);
  }
  if (picked.length < 3) return null;

  const options: QuizOption[] = [
    { text: correct.text, correct: true, role: "correct" },
    ...markDistractorRoles(correct.text, picked, correct.pos),
  ];
  const uniqueOptions = shuffleOptions(options, rng, opts.forceCorrectIndex);
  return {
    word: entry.headword,
    kind: "word2zh",
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: correct.pos,
    hideWord: false,
    source: "entry",
  };
}

/** word2def：正面显示词，四个同词性的英文释义。 */
function buildWord2Def(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number },
): QuizQuestion | null {
  const correct = firstDefinition(entry);
  if (!correct || !usableDefinition(correct.text, entry.headword)) return null;

  const rng = mulberry32(hashSeed(`${opts.seed ?? entry.id}:word2def`));
  const correctNorm = norm(correct.text);
  const candidates: { text: string; pos: string; gloss: string }[] = [];
  for (const other of pool) {
    if (other.id === entry.id) continue;
    const definition = firstDefinition(other);
    if (!definition || !usableDefinition(definition.text, other.headword)) continue;
    const candidateNorm = norm(definition.text);
    if (candidateNorm === correctNorm || candidateNorm.includes(correctNorm) || correctNorm.includes(candidateNorm)) continue;
    if (bigramJaccard(definition.text, correct.text) >= 0.6) continue;
    if (candidates.some((x) => norm(x.text) === candidateNorm)) continue;
    candidates.push({ text: definition.text, pos: definition.pos, gloss: definition.text });
  }

  const samePos = candidates.filter((x) => x.pos && correct.pos && x.pos === correct.pos);
  const primary = (correct.pos ? (samePos.length >= 3 ? samePos : []) : candidates)
    .sort((a, b) => Math.abs(a.text.length - correct.text.length) - Math.abs(b.text.length - correct.text.length));
  if (primary.length < 3) return null;
  const top = primary.slice(0, Math.max(8, 12));
  for (let i = top.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }
  const picked = top.slice(0, 3);
  if (picked.length < 3) return null;
  const options: QuizOption[] = [
    { text: correct.text, correct: true, role: "correct" },
    ...markDistractorRoles(correct.text, picked, correct.pos),
  ];
  const uniqueOptions = shuffleOptions(options, rng, opts.forceCorrectIndex);
  return {
    word: entry.headword,
    kind: "word2def",
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: correct.pos,
    hideWord: false,
    source: "entry",
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
  if (kind === "def2word" && !usableDefinition(clueInfo.text, entry.headword)) return null;
  if (kind === "zh2word" && containsWordForm(clueInfo.text, entry.headword)) return null;

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
  const primary = (clueInfo.pos ? (samePos.length >= 3 ? samePos : []) : candidates)
    .sort((a, b) => Math.abs(a.word.length - target.length) - Math.abs(b.word.length - target.length));
  if (primary.length < 3) return null;
  const top = primary.slice(0, Math.max(8, 12));
  const shuffled = [...top];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked: typeof candidates = [];
  for (const x of shuffled) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => norm(item.word) === norm(x.word))) picked.push(x);
  }
  for (const x of primary) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => norm(item.word) === norm(x.word))) picked.push(x);
  }
  if (picked.length < 3) return null;

  const options: QuizOption[] = [
    { text: target, correct: true, role: "correct" },
    ...markDistractorRoles(
      clueInfo.text,
      picked.map((item) => ({ text: item.word, pos: item.pos, gloss: item.gloss })),
      clueInfo.pos,
    ),
  ];
  const uniqueOptions = shuffleOptions(options, rng, opts.forceCorrectIndex);
  return {
    word: target,
    kind,
    options: uniqueOptions,
    correctIndex: uniqueOptions.findIndex((o) => o.correct),
    pos: clueInfo.pos,
    clue: clueInfo.text,
    hideWord: true,
    source: "entry",
  };
}

/** 当前学习阶段实际会尝试的选择题顺序。 */
export function choiceKindsForStage(entry: Entry, enabled: ChoiceQuizKind[]): ChoiceQuizKind[] {
  return KIND_ORDER[quizStageOf(entry)].filter((kind) => enabled.includes(kind));
}

export interface QuizQuestionExpectation {
  word: string;
  pos: string;
  kind: ChoiceQuizKind;
  translation?: string;
  definition?: string;
}

/**
 * AI 与公共题库共用的本地准入校验。
 * 不接受「四个都像答案」或没有差异说明的易混项，保证唯一答案与四选项结构。
 */
export function validateQuizQuestion(raw: unknown, expected: QuizQuestionExpectation): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.kind !== expected.kind || !Array.isArray(value.options) || value.options.length !== 4) return null;
  const options: QuizOption[] = [];
  for (const item of value.options) {
    if (!item || typeof item !== "object") return null;
    const option = item as Record<string, unknown>;
    if (typeof option.text !== "string" || !option.text.trim() || option.text.length > 300) return null;
    if (typeof option.correct !== "boolean") return null;
    const role = option.correct ? "correct" : option.role === "confusable" ? "confusable" : option.role === "contrast" ? "contrast" : null;
    if (!role || (option.correct && role !== "correct")) return null;
    if (role === "confusable" && (typeof option.note !== "string" || !option.note.trim())) return null;
    options.push({
      text: option.text.trim(),
      correct: option.correct,
      role,
      ...(typeof option.note === "string" && option.note.trim() ? { note: option.note.trim() } : {}),
    });
  }
  const unique = new Set(options.map((option) => norm(option.text)));
  if (unique.size !== 4) return null;
  const correctCount = options.filter((option) => option.correct).length;
  const confusableCount = options.filter((option) => option.role === "confusable").length;
  if (correctCount !== 1 || confusableCount < 1 || confusableCount > 2) return null;
  const correct = options.find((option) => option.correct)!;
  if (expected.kind === "word2def") {
    if (!usableDefinition(correct.text, expected.word)) return null;
    if (options.some((option) => containsWordForm(option.text, expected.word))) return null;
  } else if (expected.kind === "def2word" || expected.kind === "zh2word") {
    if (norm(correct.text) !== norm(expected.word)) return null;
  } else if (!expected.translation || norm(correct.text) !== norm(expected.translation)) {
    return null;
  }
  const clue = typeof value.clue === "string" ? value.clue.trim() : "";
  if (expected.kind === "def2word") {
    if (!usableDefinition(clue, expected.word)) return null;
  } else if (expected.kind === "zh2word") {
    if (!clue || !expected.translation || norm(clue) !== norm(expected.translation) || containsWordForm(clue, expected.word)) return null;
  }
  return {
    word: expected.word,
    kind: expected.kind,
    options,
    correctIndex: options.findIndex((option) => option.correct),
    pos: expected.pos,
    ...(clue ? { clue } : {}),
    hideWord: expected.kind === "def2word" || expected.kind === "zh2word",
    source: typeof value.source === "string" && (value.source === "ai" || value.source === "shared") ? value.source : undefined,
    sharedId: typeof value.sharedId === "string" ? value.sharedId : undefined,
  };
}

/** 把正确答案移到指定位置，保持其余选项相对顺序。 */
export function placeCorrectOption(question: QuizQuestion, target: number): QuizQuestion {
  if (target < 0 || target >= question.options.length || target === question.correctIndex) return question;
  const options = [...question.options];
  [options[question.correctIndex], options[target]] = [options[target], options[question.correctIndex]];
  return { ...question, options, correctIndex: target };
}

/** 按学习阶段与启用题型挑题；缺数据沿顺序降级；全不可用返回 null（回退翻卡） */
export function buildQuizQuestion(
  entry: Entry,
  pool: Entry[],
  opts: { seed?: string; forceCorrectIndex?: number; kinds?: QuizKind[] } = {},
): QuizQuestion | null {
  const enabled = opts.kinds?.length ? opts.kinds : (["word2zh", "zh2word", "def2word", "word2def"] as QuizKind[]);
  const choiceKinds = enabled.filter((kind): kind is ChoiceQuizKind =>
    kind === "word2def" || kind === "word2zh" || kind === "zh2word" || kind === "def2word",
  );
  const order = KIND_ORDER[quizStageOf(entry)].filter((k) => choiceKinds.includes(k));
  for (const kind of order) {
    const q = kind === "word2zh"
      ? buildWord2Zh(entry, pool, opts)
      : kind === "word2def"
        ? buildWord2Def(entry, pool, opts)
        : buildWordChoice(kind, entry, pool, opts);
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
