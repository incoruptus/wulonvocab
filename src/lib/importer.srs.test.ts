import { describe, expect, it } from "vitest";
import type { StudySrs } from "./study/types";
import type { Wordbook } from "./types";
import { parseImportText, rowsToEntries } from "./importer";
import { serializeBookDoc } from "./serializers";

const goodSrs: StudySrs = {
  due: 1_800_000_000_000,
  lastReview: 1_799_000_000_000,
  stability: 12.5,
  difficulty: 5.1,
  elapsedDays: 3,
  scheduledDays: 12,
  reps: 7,
  lapses: 1,
  state: 2,
  learningSteps: 0,
};

function bookWith(srs?: unknown): Wordbook {
  return {
    id: "b1",
    name: "进度携带",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    schema: { sections: [] },
    entries: [
      {
        id: "e1",
        headword: "abandon",
        tags: [],
        status: "learning",
        starred: false,
        createdAt: 1,
        updatedAt: 1,
        values: {},
        srs: srs as StudySrs | undefined,
      },
    ],
    exportSettings: {} as Wordbook["exportSettings"],
  } as unknown as Wordbook;
}

describe("文档携带学习进度（srs）", () => {
  it("导出→导入 roundtrip 保留完整 srs", () => {
    const doc = serializeBookDoc(bookWith(goodSrs));
    const parsed = parseImportText(doc, "x.json");
    const { entries } = rowsToEntries(parsed);
    expect(entries[0].srs).toMatchObject({ due: goodSrs.due, reps: goodSrs.reps, state: goodSrs.state });
  });

  it("畸形 srs 被丢弃而不是进入引擎", () => {
    const doc = serializeBookDoc(bookWith({ due: 1 }));
    const parsed = parseImportText(doc, "x.json");
    const { entries } = rowsToEntries(parsed);
    expect(entries[0].srs).toBeUndefined();
  });

  it("无 srs 的词条导出不含该键", () => {
    const doc = serializeBookDoc(bookWith(undefined));
    expect(doc.includes('"srs"')).toBe(false);
  });
});
