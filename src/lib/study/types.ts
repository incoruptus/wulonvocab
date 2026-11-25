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

/** 题目类型：选择题、例句挖空与拼写。拼写不使用四选一选项。 */
export type QuizKind = "word2zh" | "zh2word" | "def2word" | "cloze" | "spell";

/** 新词引入顺序：词库顺序 / 倒序 / 字母正倒序 / 会话乱序 */
export type NewWordOrder = "list" | "listDesc" | "az" | "azDesc" | "shuffle";
/** 复习排序：到期优先 / 可提取性升序（最可能忘的优先） */
export type ReviewOrder = "due" | "retrievability";

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
  /** 出题顺序：到期优先（默认，照顾最该复习的词）/ 随机乱序（每次会话开始时打散） */
  queueOrder: "due" | "shuffle";
  /** 新词引入顺序：先按此排序，再取当日剩余名额 */
  newOrder: NewWordOrder;
  /** 复习排序：到期优先 / 可提取性升序 */
  reviewOrder: ReviewOrder;
  /** 顽固词标记阈值；达到半阈值预告，达到阈值提示处置 */
  leechThreshold: number;
  /** 规则档规划：只在时间预算紧张时减少新词，不修改到期时间或提高上限 */
  adaptivePlan: boolean;
  /** 每天可用于当前词库的分钟数，用于估算负载 */
  dailyMinutes: number;
  /** 可选考试日期 YYYY-MM-DD；临近时保留更多复习时间 */
  examDate?: string;
  /** 弱词优先：仅调整顺序，最多占当日复习队列的 20% */
  weakPriority: boolean;
  /** 弱词占比上限，固定为 20%，保留字段便于旧配置净化 */
  weakCapPct: number;
  /** 有合适例句时使用 Cloze；缺例句自动回退 */
  clozeEnabled: boolean;
  /** 缺例句时显式允许 AI 补句，默认关；生成句缓存于本机 */
  aiCloze: boolean;
  /** 稳定期使用拼写题；首次提交定终身 */
  spellEnabled: boolean;
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
  queueOrder: "due",
  newOrder: "list",
  reviewOrder: "due",
  leechThreshold: 8,
  adaptivePlan: true,
  dailyMinutes: 20,
  weakPriority: true,
  weakCapPct: 20,
  clozeEnabled: true,
  aiCloze: false,
  spellEnabled: false,
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

/** 本地学习日键：YYYY-MM-DD；boundaryHour 用于凌晨归入前一天 */
export function ymd(ts: number, boundaryHour = 0): string {
  const d = new Date(ts - boundaryHour * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function clampBoundaryHour(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(6, Math.max(0, Math.round(value))) : 4;
}

/** 周一为一周起点，供每周一次自动宽恕使用。 */
export function weekKey(ts: number, boundaryHour = 4): string {
  const d = new Date(ts - boundaryHour * 3600000);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
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
