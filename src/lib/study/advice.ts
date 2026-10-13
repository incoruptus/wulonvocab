import { clamp } from "../utils";

/**
 * 学习建议引擎（v3）
 * ------------------------------------------------------------------
 * v2 教训（2026-10-13 用户实测）：「积压」语气只看逾期占比，导致 9 个到期 + 5 个逾期也被判成积压，
 * 且批次建议上限没有按实际到期数收口 —— 文案里出现「先做约 540 个到期单词」而实际只有 9 个，把人吓到。
 * v3 规则：
 * - 语气判定加「绝对量门槛」：积压/重负载只在到期量相对日容量确实可观时才启用；
 * - 批次建议 = min(实际到期数, 日容量 ×1.2) —— 文案里的数字永远不超过真实存在的量；
 * - 逾期量小的时候不喊口号，只在正文里温和提一句。
 */

export interface AdviceInput {
  /** 今日到期（含逾期） */
  due: number;
  /** 其中逾期（早于今天）的数量 */
  overdue: number;
  /** 今日剩余新词（配置上限 - 已学） */
  newRemaining: number;
  /** 配置的每日新词上限 */
  newPerDay: number;
  /** 日容量（见上） */
  capacity: number;
}

export interface Advice {
  tone: "light" | "normal" | "heavy" | "overdue";
  title: string;
  body: string;
  /** 建议今日新词量（0 = 先不学新词） */
  suggestedNew: number;
}

export function buildAdvice(input: AdviceInput): Advice {
  const { due, overdue, newRemaining, newPerDay, capacity } = input;
  const cap = Math.max(1, capacity);
  const load = (due + overdue * 0.5) / cap;
  // 绝对量门槛：到期数达到「30 个」或「半个日容量」才允许用重语气的积压文案
  const pileIsReal = due >= Math.max(30, Math.round(cap * 0.5));

  let tone: Advice["tone"] = "normal";
  if ((load > 3 || (due > 0 && overdue > due * 0.25)) && pileIsReal) tone = "overdue";
  else if (load > 1.2) tone = "heavy";
  else if (load < 0.6) tone = "light";

  let suggestedNew = Math.min(newRemaining, newPerDay);
  if (tone === "overdue") suggestedNew = 0;
  else if (tone === "heavy") suggestedNew = Math.min(suggestedNew, Math.max(5, Math.round(newPerDay * 0.3)));
  else if (tone === "light") suggestedNew = Math.min(suggestedNew, Math.max(0, Math.round(cap - due)));

  suggestedNew = clamp(Math.round(suggestedNew), 0, newPerDay);

  // 数字永不大于真实到期数：batch 只是「今天分几批」里的第一批
  const batch = Math.min(Math.max(1, due), Math.max(20, Math.round(cap * 1.2)));
  const overdueNote = overdue > 0 ? `，其中 ${overdue} 个逾期，顺手清掉它们` : "";
  const table: Record<Advice["tone"], { title: string; body: string }> = {
    light: {
      title: "今天很轻松",
      body:
        due > 0
          ? `复习量不大（${due} 个到期${overdueNote}），完成后可以放心推进新词。`
          : "没有积压的复习，正是学习新词的好时候。",
    },
    normal: {
      title: "今日任务",
      body: `先复习到期单词（${due} 个${overdueNote}），再学新词；忘记的词会在本轮稍后再次出现，不用怕忘。`,
    },
    heavy: {
      title: "今天复习有点多",
      body: `到期 ${due} 个，建议先把复习做完，新词减少到 ${suggestedNew} 个；单日数据有波动，不用在意一时的正确率起伏。`,
    },
    overdue: {
      title: `积压了 ${overdue} 个，别慌`,
      body:
        due > batch
          ? `先做约 ${batch} 个到期单词（今天共 ${due} 个），其余分批消化；今天先不加新词，清完积压后再恢复。`
          : `把到期的 ${due} 个清一轮，今天就是干净的；先不加新词，清完积压再恢复。`,
    },
  };

  return { tone, title: table[tone].title, body: table[tone].body, suggestedNew };
}

/** 预计用时（分钟）：复习约 0.4 分钟/张，新词约 0.8 分钟/张（经验值） */
export function estimateMinutes(due: number, newCount: number): number {
  return Math.round(due * 0.4 + newCount * 0.8);
}

/** 日容量：最近 30 天有复习日期的复习量中位数；无数据时用兜底值 */
export function computeCapacity(books: { study?: { daily: Record<string, { reviewed: number }> } }[], newPerDayTotal: number, now = Date.now()): number {
  const values: number[] = [];
  const cutoff = now - 30 * 86400000;
  for (const b of books) {
    const daily = b.study?.daily ?? {};
    for (const [key, log] of Object.entries(daily)) {
      const ts = Date.parse(`${key}T12:00:00`);
      if (Number.isFinite(ts) && ts >= cutoff && log.reviewed > 0) values.push(log.reviewed);
    }
  }
  if (values.length >= 5) {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }
  return Math.max(80, newPerDayTotal * 10);
}
