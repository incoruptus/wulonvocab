import type { Entry, ExampleItem, SenseItem, TransformItem, Wordbook } from "../types";
import { editDistance } from "./quiz";
import { firstDefinition, firstTranslation } from "./quiz";
import type { GradeValue } from "./engine";

export interface ProductionQuestion {
  kind: "cloze" | "spell";
  /** 正面试图提取的目标词；拼写与 Cloze 判定前不显示 */
  word: string;
  answer: string;
  acceptedAnswers: string[];
  hideWord: true;
  pos?: string;
  clue?: string;
  sentence?: string;
  translation?: string;
  blankStart?: number;
  blankLength?: number;
  prompt: string;
}

export interface ProductionGrade {
  rating: GradeValue;
  exact: boolean;
  distance: number;
}

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function normalizeProductionAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑–—]/g, "-")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function answerFormsOf(entry: Entry): string[] {
  const forms = [entry.headword.trim()];
  const transforms = entry.values["transforms"];
  if (Array.isArray(transforms)) {
    for (const item of transforms as TransformItem[]) {
      const form = item?.form?.trim();
      if (form && !forms.some((existing) => normalizeProductionAnswer(existing) === normalizeProductionAnswer(form))) forms.push(form);
    }
  }
  return forms.filter(Boolean);
}

function examplesOf(entry: Entry, book?: Wordbook): ExampleItem[] {
  const examples: ExampleItem[] = [];
  const senses = entry.values["senses"];
  if (Array.isArray(senses)) {
    for (const sense of senses as SenseItem[]) if (Array.isArray(sense?.examples)) examples.push(...sense.examples);
  }
  for (const section of book?.schema.sections ?? []) {
    if (section.type !== "examples") continue;
    const value = entry.values[section.key];
    if (Array.isArray(value)) examples.push(...(value as ExampleItem[]));
  }
  return examples.filter((example) => typeof example?.en === "string" && example.en.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 从一条真实例句生成 Cloze；只接受 ≤12 词、目标恰好出现一次、可还原的句子。 */
export function clozeFromExample(entry: Entry, example: ExampleItem): ProductionQuestion | null {
  const sentence = example.en.trim();
  const words = sentence.match(WORD_RE) ?? [];
  if (!sentence || words.length > 12) return null;
  const forms = answerFormsOf(entry).sort((a, b) => b.length - a.length);
  const matches: { text: string; index: number }[] = [];
  for (const form of forms) {
    const pattern = new RegExp(`(^|[^A-Za-z])(${escapeRegExp(form)})(?=$|[^A-Za-z])`, "gi");
    for (const match of sentence.matchAll(pattern)) {
      const text = match[2];
      const index = (match.index ?? 0) + match[1].length;
      if (!matches.some((item) => item.index === index)) matches.push({ text, index });
    }
  }
  if (matches.length !== 1) return null;
  const match = matches[0];
  const senses = entry.values["senses"] as SenseItem[] | undefined;
  const pos = senses?.find((sense) => sense.examples?.includes(example))?.pos;
  return {
    kind: "cloze",
    word: entry.headword,
    answer: match.text,
    acceptedAnswers: [match.text],
    hideWord: true,
    pos,
    sentence,
    translation: example.zh?.trim() || undefined,
    blankStart: match.index,
    blankLength: match.text.length,
    prompt: "读完整句，填出空缺的单词",
  };
}

export function buildCloze(entry: Entry, book?: Wordbook): ProductionQuestion | null {
  const candidates = examplesOf(entry, book)
    .map((example) => clozeFromExample(entry, example))
    .filter((question): question is ProductionQuestion => question !== null)
    .sort((a, b) => (a.sentence?.match(WORD_RE)?.length ?? 0) - (b.sentence?.match(WORD_RE)?.length ?? 0));
  return candidates[0] ?? null;
}

export function buildSpellQuestion(entry: Entry): ProductionQuestion | null {
  const translation = firstTranslation(entry);
  const definition = firstDefinition(entry);
  if (!translation && !definition) return null;
  return {
    kind: "spell",
    word: entry.headword,
    answer: entry.headword,
    acceptedAnswers: [entry.headword],
    hideWord: true,
    pos: translation?.pos || definition?.pos,
    clue: translation?.text || definition?.text,
    prompt: "根据释义，拼出这个单词",
  };
}

/** 首次提交的评分：精确 Good、一个字符之差 Hard、其他 Again。调用处可把精确且已有回忆证据升级为 Easy。 */
export function gradeProductionAnswer(input: string, question: ProductionQuestion): ProductionGrade {
  const normalized = normalizeProductionAnswer(input);
  const exact = question.acceptedAnswers.some((answer) => normalizeProductionAnswer(answer) === normalized);
  if (exact) return { rating: 3, exact: true, distance: 0 };
  const distance = Math.min(...question.acceptedAnswers.map((answer) => editDistance(normalized, normalizeProductionAnswer(answer), 3)));
  return { rating: distance === 1 ? 2 : 1, exact: false, distance };
}

export function productionSegments(question: ProductionQuestion): { before: string; after: string } | null {
  if (question.kind !== "cloze" || question.sentence === undefined || question.blankStart === undefined || question.blankLength === undefined) return null;
  return {
    before: question.sentence.slice(0, question.blankStart),
    after: question.sentence.slice(question.blankStart + question.blankLength),
  };
}
