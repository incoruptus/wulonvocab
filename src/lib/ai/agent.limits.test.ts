import { describe, expect, it, vi } from "vitest";
import { runAgentTurn, trimThread, type AgentThread } from "./agent";
import type { ChatMessage, ToolCall } from "../lookup/ai";

vi.mock("../lookup/ai", () => ({
  chatCompletionMessage: vi.fn(),
  buildSchemaBrief: vi.fn(() => '- "senses"：数组'),
}));

import { chatCompletionMessage } from "../lookup/ai";

const mockChat = vi.mocked(chatCompletionMessage);

describe("trimThread（历史裁剪）", () => {
  it("短对话不裁剪（原样返回）", () => {
    const msgs: ChatMessage[] = [{ role: "system", content: "s" }, { role: "user", content: "hi" }];
    expect(trimThread(msgs)).toBe(msgs);
  });

  it("长对话：保留 system + 标记 + 自最近 user 边界起的消息，且 tool 配对完整", () => {
    const msgs: ChatMessage[] = [{ role: "system", content: "s" }];
    for (let turn = 0; turn < 30; turn += 1) {
      msgs.push({ role: "user", content: `u${turn}` });
      const call: ToolCall = { id: `c${turn}`, function: { name: "find_entries", arguments: "{}" } };
      msgs.push({ role: "assistant", content: null, tool_calls: [call] });
      msgs.push({ role: "tool", tool_call_id: `c${turn}`, content: "{}" });
      msgs.push({ role: "assistant", content: `a${turn}` });
    }
    const trimmed = trimThread(msgs, 12);
    expect(trimmed.length).toBeLessThan(msgs.length);
    expect(trimmed[0].role).toBe("system");
    expect(trimmed[1].role).toBe("assistant"); // 省略标记
    expect(trimmed[2].role).toBe("user"); // 从 user 边界切
    // 配对完整性：每个 tool 消息都能找到此前的 assistant(tool_calls) 父
    const seen = new Set<string>();
    for (const m of trimmed) {
      if (m.role === "assistant" && m.tool_calls) for (const c of m.tool_calls) seen.add(c.id);
      if (m.role === "tool") expect(seen.has(m.tool_call_id ?? "")).toBe(true);
    }
  });
});

describe("runAgentTurn · 费用护栏", () => {
  it("单轮工具调用超限：只执行前 8 个，其余回传错误但不执行", async () => {
    const calls = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      function: { name: "find_entries", arguments: `{"query":"q${i}"}` },
    }));
    mockChat
      .mockResolvedValueOnce({ content: "", toolCalls: calls })
      .mockResolvedValueOnce({ content: "好的", toolCalls: [] });
    const exec = vi.fn(async () => ({ result: { ok: true } }));
    const thread: AgentThread = { messages: [{ role: "system", content: "s" }] };
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "查十个词",
      tools: [],
      exec,
      confirm: async () => true,
      onEvent: () => {},
    });
    expect(exec).toHaveBeenCalledTimes(8);
    const toolMsgs = thread.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(10);
    expect(String(toolMsgs[8].content)).toContain("单轮工具调用过多");
    expect(String(toolMsgs[9].content)).toContain("单轮工具调用过多");
  });

  it("工具参数过大：不执行并以 error 回传", async () => {
    const big = "x".repeat(21000);
    mockChat
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "b1", function: { name: "add_entries", arguments: `{"entries":[{"headword":"${big}"}]}` } }],
      })
      .mockResolvedValueOnce({ content: "拆小点", toolCalls: [] });
    const exec = vi.fn();
    const thread: AgentThread = { messages: [{ role: "system", content: "s" }] };
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "加一批",
      tools: [],
      exec,
      confirm: async () => true,
      onEvent: () => {},
    });
    expect(exec).not.toHaveBeenCalled();
    const toolMsg = thread.messages.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toContain("参数过大");
  });
});
