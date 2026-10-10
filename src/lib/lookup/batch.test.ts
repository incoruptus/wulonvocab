import { describe, expect, it, vi } from "vitest";
import type { LookupResult } from "../types";
import { runBatchLookup } from "./batch";

vi.mock("./index", () => ({
  runLookup: vi.fn(async (word: string): Promise<LookupResult[]> => {
    if (word === "slow") await new Promise((r) => setTimeout(r, 30));
    const ok = word !== "missing";
    return [
      {
        sourceId: "s1",
        sourceLabel: "测试源",
        kind: "freedict",
        word,
        ok,
        tookMs: 1,
        draft: ok
          ? { values: { senses: [{ translation: `${word} 的释义` }] }, summary: { headword: word } }
          : undefined,
        error: ok ? undefined : "未找到",
      },
    ];
  }),
}));

const schema = { sections: [] } as never;

describe("runBatchLookup", () => {
  it("取第一个成功源；失败任务记录 error", async () => {
    const items = await runBatchLookup(
      [
        { key: "a", word: "alpha" },
        { key: "b", word: "missing" },
      ],
      { sources: [], schema, localDictIds: [] },
    );
    expect(items[0].best?.draft).toBeTruthy();
    expect(items[0].error).toBeUndefined();
    expect(items[1].best).toBeUndefined();
    expect(items[1].error).toBeTruthy();
  });

  it("进度回调按完成数递增到总数", async () => {
    const seen: number[] = [];
    await runBatchLookup(
      [
        { key: "1", word: "a" },
        { key: "2", word: "b" },
        { key: "3", word: "slow" },
      ],
      { sources: [], schema, onProgress: (done) => void seen.push(done) },
    );
    expect(seen).toEqual([1, 2, 3]);
  });

  it("中止后不再启动新任务（未处理项保持空白）", async () => {
    const controller = new AbortController();
    const pending = runBatchLookup(
      [
        { key: "1", word: "slow" },
        { key: "2", word: "slow" },
        { key: "3", word: "slow" },
        { key: "4", word: "slow" },
      ],
      { sources: [], schema, concurrency: 1, signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 10);
    const items = await pending;
    expect(items.some((it) => !it.best && !it.error)).toBe(true);
  });
});
