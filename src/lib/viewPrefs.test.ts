import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_PREFS, normalizeBookViewState, normalizeViewPrefs } from "./viewPrefs";

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
});
