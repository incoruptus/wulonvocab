/**
 * PeerJS 扫码直传（P2 · 面对面零服务器交接）
 * ------------------------------------------------------------
 * - 会话码（20 位易读字符）一码两用：信令房间号（确定性推导）+ AES-GCM 加密钥匙；
 * - Host 出二维码（内含会话码），Guest 扫码 / 手输 → WebRTC DataChannel 直连；
 * - 双向各发一份「会话码加密信封」（与 Gist 档同一信封格式与合并管线）；
 * - 信令走 PeerJS 公共云（0.peerjs.com，国内实测可直连），P2P 内容不经过任何服务器；
 * - 分片 ≤40k 字符/帧（JSON 转义膨胀余量，远避 64KB DataChannel 帧限制），结束校验 checksum。
 */

import { normalizePairCode } from "../crypto";
import { quickHash } from "../pack";

export const PEER_CHUNK_CHARS = 40_000;
export const PEER_SESSION_TIMEOUT_MS = 60_000;

const PEER_ICE = {
  iceServers: [{ urls: "stun:stun.miwifi.com:3478" }, { urls: "stun:stun.l.google.com:19302" }],
};

type Peer = import("peerjs").Peer;
type DataConnection = import("peerjs").DataConnection;

/** 由会话码确定性推导信令 peerId（双方各自推导，无需交换长 id；含双重哈希降低碰撞） */
export function derivePeerId(sessionCode: string): string {
  const s = normalizePairCode(sessionCode);
  let h1 = 0x811c9dc5;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0xc2b2ae35) >>> 0;
  }
  return `wv-${h1.toString(36)}-${h2.toString(36)}`;
}

export function chunkEnvelope(text: string, size = PEER_CHUNK_CHARS): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** 拼回并校验（纯函数 · 单测覆盖） */
export function joinEnvelopeChunks(parts: string[], checksum: string): string {
  const text = parts.join("");
  if (quickHash(text) !== checksum) throw new Error("传输校验不一致，连接可能中断了，请重试");
  return text;
}

export type PeerTransferStatus = "connecting" | "waiting" | "connected";

export interface PeerTransferHandlers {
  onStatus: (status: PeerTransferStatus, detail?: string) => void;
  /** 收到并校验通过的完整信封文本（加密的，由调用方用会话码解密） */
  onEnvelope: (text: string) => void;
}

export interface PeerTransfer {
  peerId: string;
  /** 连接建立后调用（双向各自发送自己的信封） */
  sendEnvelope: (chunkText: string) => void;
  close: () => void;
}

function mapPeerError(err: Error & { type?: string }): Error {
  const t = err.type ?? "";
  if (t === "peer-unavailable") return new Error("没找到对方设备：码对不对？对方窗口还开着吗");
  if (t === "unavailable-id") return new Error("这个会话码正被占用，让对方重新出码");
  if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") {
    return new Error("连不上配对服务器（PeerJS），检查网络后重试");
  }
  return new Error(err.message || "直传连接失败");
}

/** 在一条 DataConnection 上双向跑分片协议：发出方 sendEnvelope；收到方 onEnvelope */
interface WireMsg {
  k?: string;
  total?: number;
  checksum?: string;
  d?: string;
}

function wireConnection(
  conn: DataConnection,
  handlers: PeerTransferHandlers,
): { sendEnvelope: (text: string) => void } {
  let rx: { total: number; checksum: string; parts: string[] } | null = null;
  conn.on("data", (raw: unknown) => {
    if (typeof raw !== "string") return;
    let msg: WireMsg | null = null;
    try {
      msg = JSON.parse(raw) as WireMsg;
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.k === "start" && typeof msg.total === "number" && typeof msg.checksum === "string") {
      rx = { total: msg.total, checksum: msg.checksum, parts: [] };
    } else if (msg.k === "chunk" && rx && typeof msg.d === "string") {
      rx.parts.push(msg.d);
    } else if (msg.k === "end" && rx) {
      const current = rx;
      rx = null;
      if (current.parts.length !== current.total) {
        handlers.onStatus("connected", "对方数据不完整，请让对方再发一次");
        return;
      }
      try {
        const text = joinEnvelopeChunks(current.parts, current.checksum);
        handlers.onEnvelope(text);
      } catch (e) {
        handlers.onStatus("connected", (e as Error).message);
      }
    }
  });
  conn.on("close", () => handlers.onStatus("connecting", "对方关闭了连接"));
  return {
    sendEnvelope(text: string) {
      const parts = chunkEnvelope(text);
      conn.send(JSON.stringify({ k: "start", total: parts.length, checksum: quickHash(text) }));
      for (const d of parts) conn.send(JSON.stringify({ k: "chunk", d }));
      conn.send(JSON.stringify({ k: "end" }));
    },
  };
}

/**
 * 建立直传会话：host 注册会话码房间并等待扫码；guest 推导同一房间并敲门。
 * 双方在 "connected" 后再各自 sendEnvelope（避免连接未就绪发送）。
 */
export async function createPeerTransfer(
  sessionCode: string,
  mode: "host" | "guest",
  handlers: PeerTransferHandlers,
): Promise<PeerTransfer> {
  let mod: typeof import("peerjs");
  try {
    mod = await import("peerjs");
  } catch {
    throw new Error("直传组件加载失败，检查网络后重试");
  }
  const peerId = derivePeerId(sessionCode);
  return new Promise<PeerTransfer>((resolve, reject) => {
    let settled = false;
    const peer: Peer = mode === "host" ? new mod.Peer(peerId, { config: PEER_ICE }) : new mod.Peer({ config: PEER_ICE });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error("等待对方超时：确认两台设备都开着这一页，码没有抄错"));
    }, PEER_SESSION_TIMEOUT_MS);
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    };
    const succeed = (conn: DataConnection) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const wired = wireConnection(conn, handlers);
      resolve({
        peerId,
        sendEnvelope: wired.sendEnvelope,
        close: () => {
          try {
            conn.close();
            peer.destroy();
          } catch {
            /* ignore */
          }
        },
      });
    };
    peer.on("error", (err) => fail(mapPeerError(err as Error & { type?: string })));
    if (mode === "host") {
      peer.on("open", () => handlers.onStatus("waiting"));
      peer.on("connection", (conn) => {
        conn.on("open", () => {
          handlers.onStatus("connected");
          succeed(conn);
        });
      });
    } else {
      peer.on("open", () => {
        handlers.onStatus("connecting");
        const conn = peer.connect(peerId, { reliable: true });
        conn.on("open", () => {
          handlers.onStatus("connected");
          succeed(conn);
        });
      });
    }
  });
}
