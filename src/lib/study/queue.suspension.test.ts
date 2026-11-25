import { describe, expect, it } from "vitest";
import { createEmptyBook, makeEntry } from "../presets";
import type { Entry, Wordbook } from "../types";
import { newSrs } from "./engine";
import { DAY_MS } from "./leech";
import { buildQueue, studyOverview } from "./queue";
import { DEFAULT_STUDY_CONFIG } from "./types";

const NOW = 1_800_000_000_000;

function learned(id: string, patch: Partial<Entry> = {}): Entry {
  const srs = { ...newSrs(NOW - 1000), reps: 2, state: 2, due: NOW - 1, lapses: 8 };
  return makeEntry({ id, headword: id, createdAt: 0, updatedAt: 0, srs, status: "learning", ...patch });
}

function book(entries: Entry[]): Wordbook {
  const base = createEmptyBook("搁置测试");
  return {
    ...base,
    entries,
    study: { config: { ...DEFAULT_STUDY_CONFIG, reviewPerDay: 1, newPerDay: 1 }, daily: {} },
  };
}

describe("顽固词队列过滤", () => {
  it("搁置词不占每日复习名额，到期边界自动回归", () => {
    const suspended = learned("suspended", { suspension: { at: NOW - 100, until: NOW + 7 * DAY_MS } });
    const due = learned("due");
    const b = book([suspended, due]);
    const before = structuredClone(suspended.srs);

    expect(buildQueue(b, "review", NOW).map((item) => item.entryId)).toEqual(["due"]);
    expect(buildQueue(b, "review", suspended.suspension!.until).map((item) => item.entryId)).toContain("suspended");
    expect(suspended.srs).toEqual(before);
  });

  it("学习概览保留学习状态，但待复习与下次到期排除搁置词", () => {
    const suspended = learned("suspended", { suspension: { at: NOW - 100, until: NOW + DAY_MS } });
    const b = book([suspended]);
    expect(studyOverview(b, NOW)).toMatchObject({ due: 0, learning: 1, nextDue: undefined });
    expect(studyOverview(b, suspended.suspension!.until)).toMatchObject({ due: 1, learning: 1 });
  });

  it("新词队列同样排除搁置，且解除后恢复", () => {
    const fresh = makeEntry({ id: "new", headword: "new", createdAt: 0, updatedAt: 0, suspension: { at: NOW - 100, until: NOW + DAY_MS } });
    const b = book([fresh]);
    expect(buildQueue(b, "new", NOW)).toEqual([]);
    expect(buildQueue(b, "new", fresh.suspension!.until).map((item) => item.entryId)).toEqual(["new"]);
  });
});
