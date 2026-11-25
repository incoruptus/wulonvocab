import { loadPersonalWordQuiz, type PersonalQuizQuestion } from "./quizBank";
import type { ChoiceQuizKind } from "./types";
import type { Entry } from "../types";
import type { QuizOption } from "./quiz";

interface Seed {
  word: string;
  pos: string;
  definition: string;
  translation: string;
  note: string;
  near: Array<{ word: string; definition: string; translation: string }>;
}

/** 示例十词的编辑选题：正确义项沿用内置词条，干扰项按词性与语义近邻人工编排。 */
const SEEDS: Seed[] = [
  {
    word: "abandon", pos: "v.",
    definition: "to leave someone you should take care of, and never come back",
    translation: "抛弃；遗弃（尤指对你有责任的人）",
    note: "desert 更强调违背责任地离开；quit 是主动停止；postpone 只是推迟",
    near: [
      { word: "desert", definition: "to leave a place or person when you have a duty to stay", translation: "抛弃；背离（职责或岗位）" },
      { word: "quit", definition: "to stop doing something, especially a job or habit", translation: "停止；辞职；戒掉" },
      { word: "postpone", definition: "to arrange for something to happen later than planned", translation: "推迟；延期" },
    ],
  },
  {
    word: "resilient", pos: "adj.",
    definition: "able to recover quickly from difficulties or setbacks",
    translation: "有韧性的；能迅速恢复的；适应力强的",
    note: "robust 强调强健；fragile 是易碎；adaptable 强调适应变化，不特指受挫后恢复",
    near: [
      { word: "robust", definition: "strong and unlikely to break, fail or become ill", translation: "强健的；稳固的；耐用的" },
      { word: "fragile", definition: "easily broken, damaged or harmed", translation: "易碎的；脆弱的" },
      { word: "adaptable", definition: "able to change in order to suit new conditions", translation: "能适应的；适应性强的" },
    ],
  },
  {
    word: "comprehensive", pos: "adj.",
    definition: "covering all the necessary parts; complete",
    translation: "全面的；综合的；包罗万象的",
    note: "thorough 强调细致；partial 只覆盖部分；comprehensible 强调能被理解",
    near: [
      { word: "thorough", definition: "done carefully and with great attention to detail", translation: "彻底的；细致的" },
      { word: "partial", definition: "including only some parts, not the whole", translation: "部分的；不完全的" },
      { word: "comprehensible", definition: "possible for someone to understand", translation: "可理解的；能懂的" },
    ],
  },
  {
    word: "subtle", pos: "adj.",
    definition: "not obvious, and therefore difficult to notice, but important",
    translation: "微妙的；不易察觉的；精妙的",
    note: "slight 只强调程度小；delicate 强调精细；obvious 则是一眼就能看出",
    near: [
      { word: "slight", definition: "small in amount, degree or importance", translation: "轻微的；少量的" },
      { word: "delicate", definition: "made or formed with great care and fine detail", translation: "精致的；精细的" },
      { word: "obvious", definition: "easy to see, understand or notice", translation: "明显的；显而易见的" },
    ],
  },
  {
    word: "coherent", pos: "adj.",
    definition: "clear, logical and well organized, so that it is easy to understand",
    translation: "连贯的；条理清楚的；（物理）相干的",
    note: "consistent 强调前后一致；confusing 是令人困惑；fragmented 是支离破碎",
    near: [
      { word: "consistent", definition: "always behaving or happening in the same way", translation: "一致的；始终如一的" },
      { word: "confusing", definition: "difficult to understand because it is not clear", translation: "令人困惑的；不清楚的" },
      { word: "fragmented", definition: "broken into separate parts that do not form a whole", translation: "支离破碎的；零散的" },
    ],
  },
  {
    word: "incentive", pos: "n.",
    definition: "something that encourages you to work harder or to do something",
    translation: "激励；刺激；动机",
    note: "motive 是内在动机；reward 是报酬；obstacle 是阻碍，方向相反",
    near: [
      { word: "motive", definition: "a reason that explains why someone acts in a certain way", translation: "动机；原因" },
      { word: "reward", definition: "something given in return for good work or behavior", translation: "奖励；报酬" },
      { word: "obstacle", definition: "something that blocks progress or makes action difficult", translation: "障碍；阻碍" },
    ],
  },
  {
    word: "thrive", pos: "v.",
    definition: "to grow, develop or be successful, especially in a good environment",
    translation: "茁壮成长；（企业等）兴旺，繁荣",
    note: "germinate 只指种子发芽；survive 只是活下来；decline 是衰退",
    near: [
      { word: "germinate", definition: "to begin to grow from a seed", translation: "（种子）发芽" },
      { word: "survive", definition: "to continue living or existing despite danger or difficulty", translation: "幸存；存活" },
      { word: "decline", definition: "to become smaller, weaker or less successful", translation: "下降；衰退" },
    ],
  },
  {
    word: "transparent", pos: "adj.",
    definition: "clear enough to see through; open and honest, with nothing hidden",
    translation: "透明的；公开透明的；（表达）一目了然的",
    note: "translucent 是半透明；opaque 是不透明；ambiguous 是有多种解释",
    near: [
      { word: "translucent", definition: "allowing light to pass through but not clear images", translation: "半透明的" },
      { word: "opaque", definition: "not allowing light to pass through", translation: "不透明的" },
      { word: "ambiguous", definition: "having more than one possible meaning", translation: "含糊的；有歧义的" },
    ],
  },
  {
    word: "legitimate", pos: "adj.",
    definition: "allowed by law; fair and reasonable",
    translation: "合法的；正当合理的",
    note: "reasonable 只强调合理；illegal 是非法；optional 表示可选而非正当",
    near: [
      { word: "reasonable", definition: "fair, sensible and appropriate in the situation", translation: "合理的；公道的" },
      { word: "illegal", definition: "not allowed by the law", translation: "非法的；违法的" },
      { word: "optional", definition: "available to choose but not required", translation: "可选的；非强制的" },
    ],
  },
  {
    word: "advocate", pos: "v.",
    definition: "to publicly support an idea, policy or group of people",
    translation: "提倡；主张；拥护",
    note: "advertise 是公开宣传；oppose 是反对；suggest 只是提出建议",
    near: [
      { word: "advertise", definition: "to make a product or service known to the public", translation: "为……做广告；宣传" },
      { word: "oppose", definition: "to disagree with a plan or action and try to stop it", translation: "反对；抵制" },
      { word: "suggest", definition: "to mention an idea or plan for someone to consider", translation: "建议；提议" },
    ],
  },
];

function distractors(seed: Seed): QuizOption[] {
  return seed.near.map((item, index) => ({
    text: item.word,
    correct: false,
    role: index === 0 ? "confusable" : "contrast",
    ...(index === 0 ? { note: seed.note } : {}),
  }));
}

function question(seed: Seed, kind: ChoiceQuizKind): PersonalQuizQuestion {
  const wordOptions = [
    { text: seed.word, correct: true, role: "correct" as const },
    ...distractors(seed),
  ];
  const englishOptions = [
    { text: seed.definition, correct: true, role: "correct" as const },
    ...seed.near.map((item, index) => ({
      text: item.definition,
      correct: false,
      role: index === 0 ? "confusable" as const : "contrast" as const,
      ...(index === 0 ? { note: seed.note } : {}),
    })),
  ];
  const chineseOptions = [
    { text: seed.translation, correct: true, role: "correct" as const },
    ...seed.near.map((item, index) => ({
      text: item.translation,
      correct: false,
      role: index === 0 ? "confusable" as const : "contrast" as const,
      ...(index === 0 ? { note: seed.note } : {}),
    })),
  ];
  const options = kind === "word2def" ? englishOptions : kind === "word2zh" ? chineseOptions : wordOptions;
  return {
    id: `sample:${seed.word}:${kind}`,
    updatedAt: 1,
    word: seed.word,
    pos: seed.pos,
    kind,
    options,
    correctIndex: 0,
    ...(kind === "def2word" ? { clue: seed.definition } : {}),
    ...(kind === "zh2word" ? { clue: seed.translation } : {}),
    hideWord: kind === "def2word" || kind === "zh2word",
    source: "entry",
  };
}

export const SAMPLE_QUIZ_QUESTIONS: PersonalQuizQuestion[] = SEEDS.flatMap((seed) =>
  (["word2def", "def2word", "zh2word", "word2zh"] as ChoiceQuizKind[]).map((kind) => question(seed, kind)),
);

export function loadSampleWordQuiz(entry: Entry, kinds: ChoiceQuizKind[], opts: { forceCorrectIndex?: number } = {}) {
  return loadPersonalWordQuiz(entry, kinds, SAMPLE_QUIZ_QUESTIONS, opts);
}
