import { createStore, del, get, keys, set } from "idb-keyval";
import { uid } from "../utils";
import type { SyncDeviceInfo, SyncMeta, SyncTombstone } from "./types";

/**
 * 同步元数据（独立 IDB，key 前缀 wulonvocab-sync-v1:）
 * - 与主 store 完全隔离：同步配置 / 设备身份 / 墓碑 / 安全快照都不进主库、也不随同步载荷传播
 * - 墓碑写入是 fire-and-forget：失败不影响主流程（最坏后果=该删除不跨端）
 */

const store = createStore("wulonvocab-sync-v1", "kv");
const META_KEY = "meta";
const SAFETY_KEEP = 3;

function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "设备";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS 设备";
  if (/Android/i.test(ua)) return "Android 设备";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows 电脑";
  return "这台设备";
}

function freshMeta(): SyncMeta {
  const device: SyncDeviceInfo = { id: uid(), name: defaultDeviceName(), createdAt: Date.now() };
  return { schema: 1, device, cursors: {}, base: null, lastSyncAt: null, tombstones: [] };
}

export async function loadSyncMeta(): Promise<SyncMeta> {
  try {
    const meta = await get<SyncMeta>(META_KEY, store);
    if (meta && meta.schema === 1 && meta.device?.id) return meta;
  } catch {
    /* ignore */
  }
  const meta = freshMeta();
  try {
    await set(META_KEY, meta, store);
  } catch {
    /* ignore */
  }
  return meta;
}

export async function saveSyncMeta(patch: Partial<SyncMeta>): Promise<void> {
  try {
    const meta = await loadSyncMeta();
    await set(META_KEY, { ...meta, ...patch, schema: 1 }, store);
  } catch {
    /* ignore */
  }
}

/** 合并墓碑：按 (kind,id,bookId) 去重，保留 deletedAt 较晚者（平局取 deviceId 字典序较大者） */
function mergeTombstones(list: SyncTombstone[]): SyncTombstone[] {
  const map = new Map<string, SyncTombstone>();
  for (const t of list) {
    const key = `${t.kind}:${t.bookId ?? ""}:${t.id}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    if (t.deletedAt > prev.deletedAt || (t.deletedAt === prev.deletedAt && t.deviceId > prev.deviceId)) {
      map.set(key, t);
    }
  }
  return [...map.values()];
}

/** 记录删除墓碑（store 的删除动作调用；deviceId 自动补齐） */
export async function recordTombstones(inputs: Array<Omit<SyncTombstone, "deviceId">>): Promise<void> {
  if (!inputs.length) return;
  try {
    const meta = await loadSyncMeta();
    const stamped: SyncTombstone[] = inputs.map((t) => ({ ...t, deviceId: meta.device.id }));
    const tombstones = mergeTombstones([...meta.tombstones, ...stamped]);
    await set(META_KEY, { ...meta, tombstones }, store);
  } catch {
    /* ignore */
  }
}

/** 清除墓碑（撤销删除 / 恢复词条时调用） */
export async function clearTombstonesFor(
  refs: Array<{ kind: SyncTombstone["kind"]; id: string; bookId?: string }>,
): Promise<void> {
  if (!refs.length) return;
  try {
    const meta = await loadSyncMeta();
    const drop = new Set(refs.map((r) => `${r.kind}:${r.bookId ?? ""}:${r.id}`));
    const tombstones = meta.tombstones.filter((t) => !drop.has(`${t.kind}:${t.bookId ?? ""}:${t.id}`));
    await set(META_KEY, { ...meta, tombstones }, store);
  } catch {
    /* ignore */
  }
}

/** 合并前安全快照（保留最近 3 份；key: safety:<ts>） */
export async function writeSafetySnapshot(json: string): Promise<void> {
  try {
    const stamp = Date.now();
    await set(`safety:${stamp}`, json, store);
    const all = (await keys(store)).map(String).filter((k) => k.startsWith("safety:")).sort();
    for (const k of all.slice(0, Math.max(0, all.length - SAFETY_KEEP))) {
      await del(k, store);
    }
  } catch {
    /* ignore */
  }
}
