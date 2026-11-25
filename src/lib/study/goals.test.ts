import { describe, expect, it } from "vitest";
import { computeStreak, goalTargetOf, studyWeekDays } from "./goals";
import { ymd } from "./types";

const at = (s: string) => Date.parse(s);

describe("study day and goals", () => {
  it("默认 4 点日界把凌晨记录归到前一天，0 点保持日历日", () => {
    const ts = at("2026-11-24T02:00:00+08:00");
    expect(ymd(ts, 4)).toBe("2026-11-23");
    expect(ymd(ts, 0)).toBe("2026-11-24");
  });

  it("三档目标固定为 20 / 40 / 60 次有效提取", () => {
    expect(goalTargetOf("light")).toBe(20);
    expect(goalTargetOf("target")).toBe(40);
    expect(goalTargetOf("challenge")).toBe(60);
    expect(goalTargetOf(undefined)).toBe(40);
  });

  it("今天未学从昨天起算；每周只宽恕一个单日缺口", () => {
    const now = at("2026-11-24T12:00:00+08:00");
    const heatmap = {
      "2026-11-23": 5,
      "2026-11-22": 4,
      "2026-11-20": 3,
      "2026-11-19": 2,
    };
    // 23、22 学习，21 缺口（本周）宽恕，20、19 学习 => 4 天连续
    expect(computeStreak(heatmap, now)).toEqual({ streak: 4, graceUsed: true });
  });

  it("同一周第二个缺口不再宽恕", () => {
    const now = at("2026-11-24T12:00:00+08:00");
    const heatmap = {
      "2026-11-23": 5,
      "2026-11-21": 4,
      "2026-11-19": 3,
    };
    expect(computeStreak(heatmap, now)).toEqual({ streak: 2, graceUsed: true });
  });

  it("关闭 streak 返回 0，备用轨道按周统计真实学习日", () => {
    const now = at("2026-11-24T12:00:00+08:00");
    const heatmap = { "2026-11-23": 5, "2026-11-24": 2 };
    expect(computeStreak(heatmap, now, { enabled: false })).toEqual({ streak: 0, graceUsed: false });
    expect(studyWeekDays(heatmap, now)).toBe(2);
  });
});
