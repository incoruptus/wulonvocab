import { describe, expect, it } from "vitest";
import { buildAdvice, computeCapacity, estimateMinutes } from "@/lib/study/advice";
import { computeHubMetrics } from "@/lib/study/metrics";
import { buildQuizOptions } from "@/lib/study/quiz";
import { makeEntry } from "@/lib/presets";
import { newSrs } from "@/lib/study/engine";
import { ymd } from "@/lib/study/types";

const T0 = Date.parse("2026-10-10T04:00:00Z");

describe("buildAdvice", () => {
  const base = { due: 0, overdue: 0, newRemaining: 15, newPerDay: 15, capacity: 100 };

  it("轻负载：建议增加新词但不超过上限", () => {
    const a = buildAdvice({ ...base, due: 10 });
    expect(a.tone).toBe("light");
    expect(a.suggestedNew).toBeGreaterThan(0);
    expect(a.suggestedNew).toBeLessThanOrEqual(15);
  });

  it("重负载：新词降至 30%", () => {
    const a = buildAdvice({ ...base, due: 180 });
    expect(a.tone).toBe("heavy");
    expect(a.suggestedNew).toBeLessThanOrEqual(Math.max(5, Math.round(15 * 0.3)));
  });

  it("积压：新词为 0 且文案含分批", () => {
    const a = buildAdvice({ ...base, due: 420, overdue: 300 });
    expect(a.tone).toBe("overdue");
    expect(a.suggestedNew).toBe(0);
    expect(a.body).toContain("分批");
  });

  it("estimateMinutes：0.4/0.8 分钟模型", () => {
    expect(estimateMinutes(10, 10)).toBe(12);
  });
});

describe("computeCapacity", () => {
  it("有历史时取中位数；无历史时用兜底", () => {
    const books = [
      {
        study: {
          daily: {
            [ymd(T0)]: { reviewed: 40 },
            [ymd(T0 - 86400000)]: { reviewed: 60 },
            [ymd(T0 - 2 * 86400000)]: { reviewed: 50 },
            [ymd(T0 - 3 * 86400000)]: { reviewed: 100 },
            [ymd(T0 - 4 * 86400000)]: { reviewed: 80 },
          },
        },
      },
    ];
    expect(computeCapacity(books, 15, T0)).toBe(60);
    expect(computeCapacity([], 15, T0)).toBe(150);
  });
});

describe("buildQuizOptions", () => {
  const pool = [
    makeEntry({ headword: "abandon", values: { senses: [{ translation: "抛弃；遗弃" }] } }),
    makeEntry({ headword: "resilient", values: { senses: [{ translation: "有韧性的；适应力强的" }] } }),
    makeEntry({ headword: "comprehensive", values: { senses: [{ translation: "全面的；综合的" }] } }),
    makeEntry({ headword: "abrupt", values: { senses: [{ translation: "突然的；唐突的" }] } }),
    makeEntry({ headword: "access", values: { senses: [{ translation: "进入；访问" }] } }),
  ];

  it("四个选项且恰好一个正确", () => {
    const q = buildQuizOptions(pool[0], pool);
    expect(q).not.toBeNull();
    expect(q!.options).toHaveLength(4);
    expect(q!.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q!.options[q!.correctIndex].text).toBe("抛弃；遗弃");
  });

  it("洗牌袋可指定正确项位置", () => {
    const q = buildQuizOptions(pool[0], pool, { forceCorrectIndex: 2 });
    expect(q!.correctIndex).toBe(2);
  });

  it("候选不足 3 个时返回 null（回退翻卡）", () => {
    const tiny = pool.slice(0, 3);
    expect(buildQuizOptions(tiny[0], tiny)).toBeNull();
  });

  it("排除与正确释义互相包含的干扰项", () => {
    const tricky = [
      makeEntry({ headword: "a", values: { senses: [{ translation: "放弃；抛弃" }] } }),
      makeEntry({ headword: "b", values: { senses: [{ translation: "放弃" }] } }), // 包含 → 排除
      makeEntry({ headword: "c", values: { senses: [{ translation: "放弃；抛弃（旧义）" }] } }), // 包含 → 排除
      makeEntry({ headword: "d", values: { senses: [{ translation: "完全无关的内容甲" }] } }),
      makeEntry({ headword: "e", values: { senses: [{ translation: "完全无关的内容乙" }] } }),
      makeEntry({ headword: "f", values: { senses: [{ translation: "完全无关的内容丙" }] } }),
    ];
    const q = buildQuizOptions(tricky[0], tricky);
    expect(q).not.toBeNull();
    const texts = q!.options.map((o) => o.text);
    expect(texts).not.toContain("放弃");
    expect(texts).not.toContain("放弃；抛弃（旧义）");
  });
});

describe("computeHubMetrics", () => {
  function book() {
    const learning = makeEntry({ headword: "a" });
    learning.srs = { ...newSrs(T0), state: 2, reps: 3, scheduledDays: 30, stability: 40, due: T0 - 2 * 86400000 };
    const young = makeEntry({ headword: "b" });
    young.srs = { ...newSrs(T0), state: 1, reps: 1, scheduledDays: 0, stability: 2, due: T0 + 3600000 };
    const future = makeEntry({ headword: "c" });
    future.srs = { ...newSrs(T0), state: 2, reps: 2, scheduledDays: 3, stability: 5, due: T0 + 2 * 86400000 };
    return {
      id: "b1",
      name: "t",
      tags: [],
      createdAt: T0,
      updatedAt: T0,
      schema: { version: 1 as const, sections: [] },
      entries: [learning, young, future, makeEntry({ headword: "d" })],
      exportSettings: {} as never,
      study: { config: { newPerDay: 10, reviewPerDay: 200, retention: 0.9, autoSpeak: true, quizMode: "flip" as const, choiceAdvance: "auto" as const }, daily: { [ymd(T0)]: { added: 2, reviewed: 5, again: 1, hard: 0, good: 4, easy: 0, ms: 0 } } },
    };
  }

  it("聚合到期/逾期/掌握/热力图/连续天数", () => {
    const m = computeHubMetrics([book() as never], T0);
    expect(m.due).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.mastered).toBe(1);
    expect(m.learning).toBe(2);
    expect(m.newRemainingTotal).toBe(8); // 10 - 已学 2
    expect(m.due7[2]).toBe(1);
    expect(m.heatmap[ymd(T0)]).toBe(5);
    expect(m.streak).toBe(1);
    expect(m.accuracy30).toBeCloseTo(0.8, 5);
  });
});
