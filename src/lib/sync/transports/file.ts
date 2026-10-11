import { hlcNow, hlcToString } from "../clock";
import { buildEnvelope, buildSyncPayload, parseEnvelope, serializeEnvelope, syncFileName } from "../pack";
import type { SyncEnvelopeV1, SyncMeta, SyncPayloadV1, SyncState } from "../types";

/**
 * 文件传输（P0 手动档）
 * - 导出/分享：快照载荷 → 信封（未加密）→ `.wulonsync` 文本（AirDrop / 微信 / 网盘都能带）
 * - 导入：parseEnvelope 校验后交还给调用方做合并预览
 */

export function exportSyncFile(state: SyncState, meta: SyncMeta): { filename: string; text: string; envelope: SyncEnvelopeV1 } {
  const payload = buildSyncPayload(state, {
    mode: "snapshot",
    deviceId: meta.device.id,
    tombstones: meta.tombstones,
  });
  const envelope = buildEnvelope(payload, {
    deviceId: meta.device.id,
    hlcString: hlcToString(hlcNow(null, meta.device.id)),
    pairId: "file",
  });
  return { filename: syncFileName(meta.device.name), text: serializeEnvelope(envelope), envelope };
}

export function importSyncFile(text: string): { envelope: SyncEnvelopeV1; payload: SyncPayloadV1 } {
  return parseEnvelope(text);
}
