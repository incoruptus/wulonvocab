import type { Entry } from "../types";
import type { ChatConfig } from "../lookup/ai";
import type { ChoiceQuizKind } from "./types";
import {
  firstDefinition,
  firstTranslation,
  buildQuizQuestion,
  choiceKindsForStage,
  placeCorrectOption,
  validateQuizQuestion,
  type QuizQuestion,
} from "./quiz";
import { quizCacheKey, readQuizCache, writeQuizCache } from "./quizCache";
import { loadAiWordQuiz } from "./quizAi";
import { isQuestionReported } from "./quizReports";
import { normalizePublicQuizBankUrl } from "./quizBankUrl";

export interface PersonalQuizQuestion extends QuizQuestion {
  id: string;
  updatedAt: number;
}

export function isPersonalQuizQuestion(value: unknown): value is PersonalQuizQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<PersonalQuizQuestion>;
  return typeof question.id === "string" && Boolean(question.id)
    && typeof question.word === "string" && Boolean(question.word.trim())
    && typeof question.updatedAt === "number" && Number.isFinite(question.updatedAt)
    && (question.kind === "word2def" || question.kind === "word2zh" || question.kind === "zh2word" || question.kind === "def2word")
    && Array.isArray(question.options);
}

export interface PublicQuizBankFile {
  format: "wulonvocab-public-quiz-bank";
  schemaVersion: 1;
  updatedAt: string;
  questions: unknown[];
}

interface BankManifest {
  schemaVersion: 1;
  updatedAt: string;
  shards: Array<{ id: string; url: string }>;
  /** 单文件公共题库：适合小题库直接发布为一个 Gist 文件。 */
  questions?: unknown[];
}

interface BankShard {
  schemaVersion: 1;
  updatedAt: string;
  questions: unknown[];
}

/** 同一清单或分片短暂失败后，本轮不同子型不重复等待网络超时。 */
const bankFailures = new Map<string, number>();
const BANK_FAILURE_COOLDOWN_MS = 30_000;

export interface SharedQuizQuestion extends QuizQuestion {
  sharedId: string;
  version: number;
  level: string;
  attribution: { author: string; license: "CC0-1.0" | "CC-BY-4.0" };
  updatedAt: string;
}

function httpsUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function shardForWord(word: string): string {
  const normalized = word.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  if (Date.now() < (bankFailures.get(url) ?? 0)) return null;
  try {
    const response = await fetch(url, { credentials: "omit", cache: "no-cache", signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      bankFailures.set(url, Date.now() + BANK_FAILURE_COOLDOWN_MS);
      return null;
    }
    const text = await response.text();
    if (text.length > 2_000_000) {
      bankFailures.set(url, Date.now() + BANK_FAILURE_COOLDOWN_MS);
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    bankFailures.set(url, Date.now() + BANK_FAILURE_COOLDOWN_MS);
    return null;
  }
}

function expectationFor(entry: Entry, kind: ChoiceQuizKind) {
  const translation = firstTranslation(entry);
  const definition = firstDefinition(entry);
  return {
    word: entry.headword.trim(),
    pos: translation?.pos || definition?.pos || "",
    kind,
    translation: translation?.text,
    definition: definition?.text,
  };
}

/** 匿名读取公共 Gist 清单与按词分片；所有题目再过同一本地校验器。 */
export async function loadSharedWordQuiz(
  entry: Entry,
  kind: ChoiceQuizKind,
  manifestUrl: string,
  opts: { forceCorrectIndex?: number } = {},
): Promise<{ question: SharedQuizQuestion; fromCache: boolean } | null> {
  const url = normalizePublicQuizBankUrl(manifestUrl);
  if (!url) return null;
  const expected = expectationFor(entry, kind);
  const manifestKey = quizCacheKey({ bank: "manifest", url });
  let manifest = await readQuizCache<BankManifest>(manifestKey);
  let fromCache = Boolean(manifest);
  if (!manifest) {
    manifest = await fetchJson<BankManifest>(url);
    if (!manifest || manifest.schemaVersion !== 1 || (!Array.isArray(manifest.shards) && !Array.isArray(manifest.questions))) return null;
    await writeQuizCache(manifestKey, manifest);
  }
  if (Array.isArray(manifest.questions)) {
    const matches = manifest.questions
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .filter((item) => item.status === "approved" && typeof item.id === "string")
      .filter((item) => typeof item.word === "string" && item.word.trim().toLowerCase() === expected.word.toLowerCase())
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    for (const raw of matches) {
      const question = validateQuizQuestion({ ...raw, source: "shared", sharedId: raw.id }, expected);
      if (!question || question.kind !== kind || await isQuestionReported(question)) continue;
      const placed = placeCorrectOption(question, opts.forceCorrectIndex ?? question.correctIndex);
      return {
        question: {
          ...placed,
          sharedId: raw.id as string,
          version: typeof raw.version === "number" ? raw.version : 1,
          level: typeof raw.level === "string" ? raw.level : "B1",
          attribution:
            raw.attribution && typeof raw.attribution === "object"
              ? raw.attribution as SharedQuizQuestion["attribution"]
              : { author: "社区", license: "CC0-1.0" },
          updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        },
        fromCache,
      };
    }
    return null;
  }
  const shardId = shardForWord(expected.word);
  const shard = manifest.shards.find((item) => item.id === shardId);
  const shardUrl = shard ? httpsUrl(shard.url, url) : null;
  if (!shardUrl) return null;
  const shardKey = quizCacheKey({ bank: "shard", url: shardUrl });
  let data = await readQuizCache<BankShard>(shardKey);
  if (!data) {
    data = await fetchJson<BankShard>(shardUrl);
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.questions)) return null;
    await writeQuizCache(shardKey, data);
  } else {
    fromCache = true;
  }
  const matches = data.questions
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => item.status === "approved" && typeof item.id === "string")
    .filter((item) => typeof item.word === "string" && item.word.trim().toLowerCase() === expected.word.toLowerCase())
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  for (const raw of matches) {
    const question = validateQuizQuestion(
      { ...raw, source: "shared", sharedId: raw.id },
      expected,
    );
    if (!question || question.kind !== kind || await isQuestionReported(question)) continue;
    const placed = placeCorrectOption(question, opts.forceCorrectIndex ?? question.correctIndex);
    return {
      question: {
        ...placed,
        sharedId: raw.id as string,
        version: typeof raw.version === "number" ? raw.version : 1,
        level: typeof raw.level === "string" ? raw.level : "B1",
        attribution:
          raw.attribution && typeof raw.attribution === "object"
            ? raw.attribution as SharedQuizQuestion["attribution"]
            : { author: "社区", license: "CC0-1.0" },
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
      },
      fromCache,
    };
  }
  return null;
}

/** 个人题库只读取本词库数据；与公共题一样经过同一唯一答案与选项校验。 */
export function loadPersonalWordQuiz(
  entry: Entry,
  kinds: ChoiceQuizKind[],
  questions: PersonalQuizQuestion[] | undefined,
  opts: { forceCorrectIndex?: number } = {},
): QuizQuestion | null {
  if (!questions?.length) return null;
  const expectedKinds = choiceKindsForStage(entry, kinds);
  const matches = questions
    .filter(isPersonalQuizQuestion)
    .filter((question) => question.word.trim().toLowerCase() === entry.headword.trim().toLowerCase())
    .filter((question) => expectedKinds.includes(question.kind))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const item of matches) {
    const expected = expectationFor(entry, item.kind);
    const validated = validateQuizQuestion(item, expected);
    if (!validated) continue;
    return placeCorrectOption({ ...validated, source: "entry" }, opts.forceCorrectIndex ?? validated.correctIndex);
  }
  return null;
}

/** 题目供给：所选题库层 → 显式开启的 AI → 词条现有字段。 */
export async function loadWordQuizQuestion(
  entry: Entry,
  pool: Entry[],
  kinds: ChoiceQuizKind[],
  opts: {
    aiConfig?: ChatConfig;
    aiEnabled?: boolean;
    bankUrl?: string;
    bankSource?: "public" | "personal" | "both";
    personalQuestions?: PersonalQuizQuestion[];
    /** 内置编辑题，只在所选题库层没有可用题时启用。 */
    fallbackQuestions?: PersonalQuizQuestion[];
    forceCorrectIndex?: number;
  } = {},
): Promise<QuizQuestion | null> {
  const sharedKinds = choiceKindsForStage(entry, kinds.length ? kinds : (["word2zh", "zh2word", "def2word", "word2def"] as ChoiceQuizKind[]));
  if (!sharedKinds.length) return null;
  if (opts.bankSource === "personal" || opts.bankSource === "both") {
    for (const kind of sharedKinds) {
      const personal = loadPersonalWordQuiz(entry, [kind], opts.personalQuestions, opts);
      if (personal) return personal;
    }
  }
  if (opts.bankUrl && opts.bankSource !== "personal") {
    for (const kind of sharedKinds) {
      const shared = await loadSharedWordQuiz(entry, kind, opts.bankUrl, opts);
      if (shared) return shared.question;
    }
  }
  if (opts.fallbackQuestions) {
    for (const kind of sharedKinds) {
      const fallback = loadPersonalWordQuiz(entry, [kind], opts.fallbackQuestions, opts);
      if (fallback) return fallback;
    }
  }
  if (opts.aiEnabled && opts.aiConfig && sharedKinds.length) {
    try {
      const generated = await loadAiWordQuiz(entry, pool, sharedKinds[0], opts.aiConfig, opts);
      if (generated) return generated.question;
    } catch {
      /* AI 失败静默降级 */
    }
  }
  return buildQuizQuestion(entry, pool, { kinds: sharedKinds, forceCorrectIndex: opts.forceCorrectIndex });
}

export function buildQuizContribution(
  question: QuizQuestion,
  input: { author: string; license: "CC0-1.0" | "CC-BY-4.0"; level?: string },
): string {
  const payload = {
    format: "wulonvocab-word-quiz-contribution",
    version: 1,
    question: {
      word: question.word,
      pos: question.pos,
      kind: question.kind,
      clue: question.clue ?? "",
      options: question.options,
      difficulty: question.options.filter((option) => option.role === "confusable").length === 2 ? "normal" : "easy",
      timeLimit: 15,
      level: input.level || "B1",
      attribution: { author: input.author.trim() || "匿名", license: input.license },
      status: "pending",
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** 个人题库按稳定 ID 合并；同题取较新版本，删除墓碑在同步层过滤。 */
export function mergePersonalQuizQuestions(a: PersonalQuizQuestion[], b: PersonalQuizQuestion[]): PersonalQuizQuestion[] {
  const byId = new Map<string, PersonalQuizQuestion>();
  for (const question of [...a, ...b]) {
    if (!isPersonalQuizQuestion(question)) continue;
    const previous = byId.get(question.id);
    if (!previous || question.updatedAt > previous.updatedAt) byId.set(question.id, question);
  }
  return [...byId.values()].sort((x, y) => y.updatedAt - x.updatedAt || x.id.localeCompare(y.id)).slice(0, 5000);
}

/** 将个人题打包成可匿名读取的单文件公共题库，不改变个人题的 ID 与内容。 */
export function buildPublicQuizBankFile(
  questions: PersonalQuizQuestion[],
  attribution: { author: string; license: "CC0-1.0" | "CC-BY-4.0" } = { author: "社区", license: "CC0-1.0" },
): PublicQuizBankFile {
  return {
    format: "wulonvocab-public-quiz-bank",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    questions: questions.map((question) => ({
      ...question,
      id: `personal:${question.id}`,
      version: 1,
      level: "B1",
      status: "approved",
      updatedAt: new Date(question.updatedAt).toISOString(),
      attribution: { author: attribution.author.trim() || "匿名", license: attribution.license },
    })),
  };
}

export function buildQuizReport(question: QuizQuestion, reason: string): string {
  return JSON.stringify({
    format: "wulonvocab-word-quiz-report",
    version: 1,
    questionId: question.sharedId ?? null,
    word: question.word,
    kind: question.kind,
    reason: reason.trim(),
  }, null, 2);
}
