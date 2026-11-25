import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_PREFS, mergeSavedViews, normalizeBookViewState, normalizeViewPrefs, type SavedView } from "./viewPrefs";

describe("viewPrefs", () => {
  it("缺省与非法值安全回退", () => {
    expect(normalizeViewPrefs(undefined)).toEqual(DEFAULT_VIEW_PREFS);
    expect(normalizeViewPrefs({ sort: "bad", dir: "sideways", group: "bad", status: "bad" })).toMatchObject({
      sort: "list",
      dir: "asc",
      group: "none",
      status: "all",
    });
  });

  it("乱序偏好没有 seed 时补稳定 seed，保存视图数量受限", () => {
    expect(normalizeViewPrefs({ sort: "shuffle" }).shuffleSeed).toBe(0);
    expect(normalizeViewPrefs({ leechFilter: "suspended" }).leechFilter).toBe("suspended");
    expect(normalizeViewPrefs({ leechFilter: "bad" }).leechFilter).toBe("all");
    const raw = {
      prefs: { sort: "az", dir: "desc" },
      savedViews: Array.from({ length: 25 }, (_, index) => ({ id: `v${index}`, name: `视图 ${index}`, prefs: { group: "initial" } })),
    };
    const state = normalizeBookViewState(raw);
    expect(state.prefs.sort).toBe("az");
    expect(state.savedViews).toHaveLength(20);
    expect(state.savedViews[0].prefs.group).toBe("initial");
  });

  it("保存视图按 id 合并，较新版本胜且结果幂等", () => {
    const view = (id: string, updatedAt: number, name: string): SavedView => ({
      id, name, updatedAt, prefs: { ...DEFAULT_VIEW_PREFS, tag: name },
    });
    const local = [view("v1", 100, "旧"), view("v2", 300, "本机新增")];
    const remote = [view("v1", 200, "远端更新"), view("v3", 250, "远端新增")];
    const merged = mergeSavedViews(local, remote);
    expect(merged.map((item) => [item.id, item.name])).toEqual([
      ["v1", "远端更新"], ["v3", "远端新增"], ["v2", "本机新增"],
    ]);
    expect(mergeSavedViews(merged, remote)).toEqual(merged);
    expect(mergeSavedViews(remote, local)).toEqual(merged);
  });

  it("相同时间戳按内容确定性裁决，最多保留最新 20 个", () => {
    const view = (index: number): SavedView => ({
      id: `v${index}`, name: `视图 ${index}`, updatedAt: 10, prefs: { ...DEFAULT_VIEW_PREFS },
    });
    const a = [view(1), view(2)];
    const b = [view(2), view(3)];
    expect(mergeSavedViews(a, b)).toEqual(mergeSavedViews(b, a));
    expect(mergeSavedViews(a, b).map((item) => item.id)).toEqual(["v1", "v2", "v3"]);
    const many = Array.from({ length: 25 }, (_, index) => ({ ...view(index), updatedAt: index }));
    expect(mergeSavedViews(many, []).map((item) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `v${index + 5}`),
    );
  });
});
