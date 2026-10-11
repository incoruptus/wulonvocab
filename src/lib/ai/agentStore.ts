import { createStore, del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import type { ChatMessage } from "@/lib/lookup/ai";

/**
 * AI 管家会话持久化（独立 IDB，按词库存）
 * ------------------------------------------------------------
 * - items：UI 气泡（含工具块）；messages：协议历史（含 system 与 tool 配对）；
 * - 聊天记录是设备本地资产：不进主 store、不随同步载荷传播；
 * - 读时清洗（running/streaming 复位）、写时裁剪（防膨胀）。
 */

export interface AgentChatItem {
  kind: "user" | "assistant" | "tool" | "stop";
  text: string;
  name?: string;
  state?: "running" | "ok";
  /** 流式中（渲染尾部光标） */
  streaming?: boolean;
}

export interface StoredAgentChat {
  items: AgentChatItem[];
  messages: ChatMessage[];
  at: number;
}

const ITEMS_CAP = 120;
const MESSAGES_CAP = 240;

const store = createStore("wulonvocab-agent-v1", "kv");
const keyOf = (bookId: string) => `chat:${bookId}`;

function sanitizeItems(items: AgentChatItem[]): AgentChatItem[] {
  return items.slice(-ITEMS_CAP).map((it) => {
    if (it.state === "running" || it.streaming) return { ...it, state: it.state === "running" ? "ok" : it.state, streaming: false };
    return it;
  });
}

export async function loadAgentChat(bookId: string): Promise<StoredAgentChat | null> {
  try {
    const raw = await idbGet<StoredAgentChat>(keyOf(bookId), store);
    if (!raw || !Array.isArray(raw.items) || !Array.isArray(raw.messages)) return null;
    return { items: sanitizeItems(raw.items), messages: raw.messages.slice(-MESSAGES_CAP), at: raw.at ?? 0 };
  } catch {
    return null;
  }
}

export async function saveAgentChat(bookId: string, data: { items: AgentChatItem[]; messages: ChatMessage[] }): Promise<void> {
  try {
    const payload: StoredAgentChat = {
      items: sanitizeItems(data.items),
      messages: data.messages.slice(-MESSAGES_CAP),
      at: Date.now(),
    };
    await idbSet(keyOf(bookId), payload, store);
  } catch {
    /* 持久化失败不影响对话 */
  }
}

export async function clearAgentChat(bookId: string): Promise<void> {
  try {
    await idbDel(keyOf(bookId), store);
  } catch {
    /* ignore */
  }
}
