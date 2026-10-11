/**
 * HLC 混合逻辑时钟（docs/research/sync-2026-10.md §2.3）
 * - 用途：同步包的因果排序（baseCursor 链）与同毫秒平局裁决的补充顺序
 * - 注意：实体比较仍以各自的 updatedAt 为主；HLC 不替代时间戳
 */

export interface Hlc {
  ts: number;
  counter: number;
  deviceId: string;
}

export function hlcNow(prev: Hlc | null, deviceId: string, now: number = Date.now()): Hlc {
  if (prev && now <= prev.ts) {
    // 时钟回拨或同毫秒：counter 递增，绝不产出比上一次更小的 HLC
    return { ts: prev.ts, counter: prev.counter + 1, deviceId };
  }
  return { ts: now, counter: 0, deviceId };
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

export function hlcToString(h: Hlc): string {
  return `${h.ts}:${h.counter}:${h.deviceId}`;
}

export function parseHlc(s: string): Hlc | null {
  const parts = s.split(":");
  if (parts.length < 3) return null;
  const [tsRaw, counterRaw, ...rest] = parts;
  const ts = Number(tsRaw);
  const counter = Number(counterRaw);
  const deviceId = rest.join(":");
  if (!Number.isFinite(ts) || !Number.isFinite(counter) || !deviceId) return null;
  return { ts, counter, deviceId };
}
