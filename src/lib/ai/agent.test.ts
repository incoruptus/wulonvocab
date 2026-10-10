import { describe, expect, it, vi } from "vitest";
import { runAgentTurn, type AgentEvent, type AgentThread } from "./agent";

vi.mock("../lookup/ai", () => ({
  chatCompletionMessage: vi.fn(),
  buildSchemaBrief: vi.fn(() => '- "senses"（词性与释义，类型 senses）：数组'),
}));

import { chatCompletionMessage } from "../lookup/ai";

const mockChat = vi.mocked(chatCompletionMessage);

const makeThread = (): AgentThread => ({ messages: [{ role: "system", content: "sys" }] });

describe("runAgentTurn", () => {
  it("执行工具调用并把结果回传，再以文本收尾", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "c1", function: { name: "add_entries", arguments: '{"entries":[{"headword":"alpha"}]}' } }],
      })
      .mockResolvedValueOnce({ content: "已加好 alpha", toolCalls: [] });

    const exec = vi.fn(async () => ({ result: { added: 1 } }));
    const events: AgentEvent[] = [];
    const thread = makeThread();
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "加 alpha",
      tools: [],
      exec,
      confirm: async () => true,
      onEvent: (e) => void events.push(e),
    });

    expect(exec).toHaveBeenCalledWith("add_entries", { entries: [{ headword: "alpha" }] });
    const roles = thread.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "tool", "assistant"]);
    const toolMsg = thread.messages.find((m) => m.role === "tool");
    expect(toolMsg?.tool_call_id).toBe("c1");
    expect(String(toolMsg?.content)).toContain('"added":1');
    expect(events.some((e) => e.type === "tool-call" && e.name === "add_entries")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "assistant", text: "已加好 alpha" });
  });

  it("危险操作：用户取消则不执行 apply，并把取消回传模型", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "c2", function: { name: "delete_entries", arguments: '{"headwords":["kappa"]}' } }],
      })
      .mockResolvedValueOnce({ content: "好的，已取消", toolCalls: [] });

    const apply = vi.fn(() => ({ deleted: 1 }));
    const exec = vi.fn(async () => ({
      result: null,
      needsConfirm: true,
      confirmSummary: "删除 1 个词条：kappa",
      apply,
    }));
    const thread = makeThread();
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "删掉 kappa",
      tools: [],
      exec,
      confirm: async () => false,
      onEvent: () => {},
    });

    expect(apply).not.toHaveBeenCalled();
    const toolMsg = thread.messages.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toContain("cancelled");
  });

  it("危险操作：用户确认后调用 apply 并入账", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "c3", function: { name: "add_field", arguments: '{"label":"搭配"}' } }],
      })
      .mockResolvedValueOnce({ content: "字段已加好", toolCalls: [] });

    const apply = vi.fn(() => ({ ok: true, key: "pairing" }));
    const exec = vi.fn(async () => ({
      result: null,
      needsConfirm: true,
      confirmSummary: "新增字段「搭配」",
      apply,
    }));
    const thread = makeThread();
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "加字段",
      tools: [],
      exec,
      confirm: async () => true,
      onEvent: () => {},
    });

    expect(apply).toHaveBeenCalledTimes(1);
    const toolMsg = thread.messages.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toContain('"key":"pairing"');
  });

  it("工具抛错时以 error 回传而不中断循环", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "c4", function: { name: "find_entries", arguments: "not-json" } }],
      })
      .mockResolvedValueOnce({ content: "我换个方式", toolCalls: [] });

    const exec = vi.fn();
    const thread = makeThread();
    await runAgentTurn({
      cfg: { baseUrl: "https://x", model: "m" },
      thread,
      userText: "查一下",
      tools: [],
      exec,
      confirm: async () => true,
      onEvent: () => {},
    });
    expect(exec).not.toHaveBeenCalled();
    const toolMsg = thread.messages.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toContain("error");
  });
});
