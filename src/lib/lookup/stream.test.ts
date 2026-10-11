import { describe, expect, it, vi } from "vitest";
import { createSseParser, streamChatCompletionMessage } from "./ai";
import type { SseDelta } from "./ai";

function collect(): { deltas: SseDelta[]; parser: ReturnType<typeof createSseParser> } {
  const deltas: SseDelta[] = [];
  return { deltas, parser: createSseParser((d) => deltas.push(d)) };
}

describe("createSseParser（SSE 增量解析）", () => {
  it("跨任意切分边界正确解析 content 增量", () => {
    const { deltas, parser } = collect();
    const frame = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
    const all = frame("你好") + frame("，世界");
    // 按三字节切开，模拟网络分块落在 JSON 中间
    parser.feed(all.slice(0, 17));
    parser.feed(all.slice(17, 40));
    parser.feed(all.slice(40));
    parser.flush();
    expect(deltas.map((d) => d.content).join("")).toBe("你好，世界");
  });

  it("聚合 tool_calls 增量（index 分片）；[DONE] 与垃圾行不炸", () => {
    const { deltas, parser } = collect();
    const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
    parser.feed(frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "find_entries", arguments: '{"qu' } }] } }] }));
    parser.feed(frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ery":"ab"}' } }] } }] }));
    parser.feed(": keep-alive\n\n");
    parser.feed("data: not-json\n\n");
    parser.feed("data: [DONE]\n\n");
    parser.flush();
    const calls = deltas.flatMap((d) => d.toolCalls ?? []);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ index: 0, id: "c1", name: "find_entries" });
    expect(calls[1].arguments).toBe('ery":"ab"}');
  });
});

describe("streamChatCompletionMessage（fetch 桩）", () => {
  it("SSE 流：回调增量 + 聚合完整 toolCalls", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "好的" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "add_entries", arguments: '{"entries":[]}' } }] } }] })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const f of frames) controller.enqueue(enc.encode(f));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })),
    );
    const chunks: string[] = [];
    const result = await streamChatCompletionMessage(
      { baseUrl: "https://api.example.com/v1", model: "m" },
      [{ role: "user", content: "hi" }],
      { tools: [], onDelta: (t) => chunks.push(t) },
    );
    vi.unstubAllGlobals();
    expect(chunks.join("")).toBe("好的");
    expect(result.content).toBe("好的");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ id: "c1", function: { name: "add_entries", arguments: '{"entries":[]}' } });
  });

  it("服务端不支持流式（JSON 响应）→ 降级为一次性 delta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "直接回答" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const chunks: string[] = [];
    const result = await streamChatCompletionMessage(
      { baseUrl: "https://api.example.com/v1", model: "m" },
      [{ role: "user", content: "hi" }],
      { onDelta: (t) => chunks.push(t) },
    );
    vi.unstubAllGlobals();
    expect(chunks).toEqual(["直接回答"]);
    expect(result.content).toBe("直接回答");
  });
});
