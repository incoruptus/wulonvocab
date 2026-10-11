import { describe, expect, it } from "vitest";
import type { Entry, SenseItem } from "../types";
import { makeEntry } from "../presets";
import { buildQuizQuestion, bigramJaccard, editDistance, quizStageOf } from "./quiz";
import type { StudySrs } from "./types";

function sense(id: string, translation: string, definition = "", pos = "n."): SenseItem {
  return {
    id,
    pos,
    translation,
    definition,
    examples: [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  };
}

function srs(patch: Partial<StudySrs> = {}): StudySrs {
  return {
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    learningSteps: 0,
    ...patch,
  };
}

function mk(id: string, word: string, translation: string, opts: { def?: string; pos?: string; srs?: StudySrs } = {}): Entry {
  return makeEntry({
    id,
    headword: word,
    values: { senses: [sense(`s-${id}`, translation, opts.def ?? "", opts.pos ?? "n.")] },
    ...(opts.srs ? { srs: opts.srs } : {}),
  });
}

const pool: Entry[] = [
  mk("a", "abandon", "抛弃；遗弃"),
  mk("b", "ability", "能力；才能"),
  mk("c", "calendar", "日历；日程表"),
  mk("d", "harvest", "收获；收割"),
  mk("e", "tunnel", "隧道；地道"),
  mk("f", "orbit", "轨道；运行"),
];

describe("工具函数", () => {
  it("editDistance 小词距离与 bigramJaccard 语义重叠", () => {
    expect(editDistance("abandon", "abandoned", 2)).toBeLessThanOrEqual(2);
    expect(editDistance("calendar", "tunnel", 3)).toBeGreaterThan(3);
    expect(bigramJaccard("抛弃；遗弃", "遗弃；抛弃")).toBeGreaterThanOrEqual(0.6);
    expect(bigramJaccard("抛弃；遗弃", "轨道；运行")).toBeLessThan(0.2);
  });

  it("quizStageOf：无 srs 视为 learning；Review 且间隔 ≥10 天为 stable", () => {
    expect(quizStageOf(pool[0])).toBe("learning");
    expect(quizStageOf(mk("r", "ridge", "山脊", { srs: srs({ state: 2, scheduledDays: 3 }) }))).toBe("review");
    expect(quizStageOf(mk("s", "ridge", "山脊", { srs: srs({ state: 2, scheduledDays: 12 }) }))).toBe("stable");
  });
});

describe("buildQuizQuestion 题型挑选与降级", () => {
  it("zh2word：隐藏词头、线索为中文释义、选项为英文词", () => {
    const target = pool[0];
    const q = buildQuizQuestion(target, pool, { kinds: ["zh2word"], seed: "t1" });
    expect(q).toBeTruthy();
    expect(q!.kind).toBe("zh2word");
    expect(q!.hideWord).toBe(true);
    expect(q!.clue).toContain("抛弃");
    expect(q!.options).toHaveLength(4);
    expect(q!.options.some((o) => o.text === "abandon" && o.correct)).toBe(true);
    expect(q!.options.find((o) => o.correct)!.text).toBe("abandon");
  });

  it("def2word：stable 词带英英释义时优先出；缺释义自动降级到 zh2word", () => {
    const stable = mk("w1", "wander", "漫步；闲逛", {
      def: "to walk slowly around a place without a clear direction",
      srs: srs({ state: 2, scheduledDays: 30 }),
    });
    const book = [stable, ...pool.slice(1)];
    const q = buildQuizQuestion(stable, book, { seed: "t2" });
    expect(q!.kind).toBe("def2word");
    expect(q!.clue).toContain("walk slowly");

    const noDef = mk("w2", "wander", "漫步；闲逛", { srs: srs({ state: 2, scheduledDays: 30 }) });
    const q2 = buildQuizQuestion(noDef, [noDef, ...pool.slice(1)], { seed: "t3" });
    expect(q2!.kind).toBe("zh2word");
  });

  it("kinds 过滤与全不可用回退 null", () => {
    const q = buildQuizQuestion(pool[0], pool, { kinds: ["word2zh"], seed: "t4" });
    expect(q!.kind).toBe("word2zh");
    expect(q!.hideWord).toBe(false);

    const tiny = [mk("x", "sun", "太阳"), mk("y", "moon", "月亮")];
    expect(buildQuizQuestion(tiny[0], tiny)).toBeNull();
  });

  it("干扰词排除与答案词形过近的候选（abandon vs abandoned 不作干扰项）", () => {
    const target = pool[0];
    const withTwin = [target, mk("tw", "abandoned", "被遗弃的"), ...pool.slice(1)];
    const q = buildQuizQuestion(target, withTwin, { kinds: ["zh2word"], seed: "t5", forceCorrectIndex: 0 });
    expect(q!.options.some((o) => o.text === "abandoned")).toBe(false);
  });
});
