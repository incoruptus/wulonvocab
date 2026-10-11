/**
 * 学习（SRS）领域类型
 * ------------------------------------------------------------------
 * 调度状态存储在 Entry.srs（可序列化数值字段，日期用 epoch ms），
 * 由 lib/study/engine.ts 在 ts-fsrs 的 Card 之间转换。
 */

export interface StudySrs {
  /** 到期时间（epoch ms） */
  due: number;
  /** 上次复习时间（epoch ms，未学习过为空） */
  lastReview?: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State：0=New 1=Learning 2=Review 3=Relearning */
  state: number;
  /** 学习步位置 */
  learningSteps: number;
}

/** 选择题题型：看词选义 / 看义选词 / 看释义选词（英英线索） */
export type QuizKind = "word2zh" | "zh2word" | "def2word";

/** 每本书的学习配置 */
export interface StudyConfig {
  /** 每日新词上限 */
  newPerDay: number;
  /** 每日复习上限（含新词首学） */
  reviewPerDay: number;
  /** 记忆保持率（FSRS desired retention） */
  retention: number;
  /** 卡片正面自动发音 */
  autoSpeak: boolean;
  /** 学习模式：翻卡自评 / 选择题 */
  quizMode: "flip" | "choice";
  /** 选择题答后推进：自动下一题 / 按「继续」 */
  choiceAdvance: "auto" | "continue";
  /** 启用的选择题题型（按词的学习阶段自动挑选；缺数据自动降级） */
  choiceTypes: QuizKind[];
  /** 选择题答对后询问「稳 / 猜」（猜 → Hard，更贴近真实记忆） */
  choiceConfidence: boolean;
  /** 相似词避让：形近或义近的词不紧挨着出现（易混组可用「本场允许」临时放行） */
  similarityAvoid: boolean;
}

export const DEFAULT_STUDY_CONFIG: StudyConfig = {
  newPerDay: 15,
  reviewPerDay: 200,
  retention: 0.9,
  autoSpeak: true,
  quizMode: "flip",
  choiceAdvance: "auto",
  choiceTypes: ["word2zh", "zh2word", "def2word"],
  choiceConfidence: true,
  similarityAvoid: true,
};

/** 每日学习记录（用于统计与每日限额） */
export interface StudyDailyLog {
  /** 当日首次学习的新词数 */
  added: number;
  /** 当日复习次数（含新词） */
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  /** 当日学习耗时（ms） */
  ms: number;
}

export interface BookStudy {
  config: StudyConfig;
  /** ymd(本地日期) -> 日志 */
  daily: Record<string, StudyDailyLog>;
}

export function emptyDailyLog(): StudyDailyLog {
  return { added: 0, reviewed: 0, again: 0, hard: 0, good: 0, easy: 0, ms: 0 };
}

/** 本地日期键：YYYY-MM-DD */
export function ymd(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 保留最近 180 天的日志 */
export function pruneDaily(daily: Record<string, StudyDailyLog>, now: number): Record<string, StudyDailyLog> {
  const keys = Object.keys(daily).sort();
  if (keys.length <= 180) return daily;
  const keep = new Set(keys.slice(-180));
  const out: Record<string, StudyDailyLog> = {};
  for (const k of keys) if (keep.has(k)) out[k] = daily[k];
  void now;
  return out;
}
