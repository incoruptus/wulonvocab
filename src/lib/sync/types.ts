import type { AppSettings, Entry, ExportPreset, LocalDictMeta, LookupSourceConfig, Wordbook } from "../types";

/**
 * 跨端同步 · 类型 v1（P0）
 * 依据 docs/research/sync-2026-10.md：传输可插拔、合并层纯函数、加密与传输解耦。
 */

export const SYNC_FORMAT = "wulonvocab-sync" as const;
export const SYNC_FORMAT_VERSION = 1 as const;

/** 设备本地设置：明暗模式与强调色因设备而异——不进同步载荷、不参与哈希与冲突裁决 */
export const LOCAL_SETTING_KEYS = ["theme", "accent"] as const;
export type LocalSettingKey = (typeof LOCAL_SETTING_KEYS)[number];

/** 同步载荷中的设置形态：剥离 lastBookId 与设备本地字段 */
export type SyncSettings = Omit<AppSettings, "lastBookId" | LocalSettingKey>;

/** 剥离设备本地字段（构建载荷 / 计算指纹用） */
export function stripLocalSettings(s: AppSettings): SyncSettings {
  const { theme: _theme, accent: _accent, lastBookId: _last, ...rest } = s;
  void _theme;
  void _accent;
  void _last;
  return rest;
}

/** 取本机设置里的本地独占字段（合并回写 / 应用远端时保留） */
export function pickLocalSettings(s: AppSettings): Pick<AppSettings, LocalSettingKey> {
  return { theme: s.theme, accent: s.accent };
}

/** patch 是否触及需要同步的设置键（决定：是否 bump updatedAt / 是否立即推送） */
export function hasSyncedSettingChange(patch: Partial<AppSettings>): boolean {
  return Object.keys(patch).some(
    (k) => k !== "updatedAt" && !(LOCAL_SETTING_KEYS as readonly string[]).includes(k),
  );
}

/** 设备身份（存独立 IDB，不进主 store、不入同步载荷之外的隐私面） */
export interface SyncDeviceInfo {
  id: string;
  name: string;
  createdAt: number;
}

/** 删除墓碑：防「删了又回来」。kind=entry 时必须带 bookId */
export interface SyncTombstone {
  kind: "book" | "entry" | "lookupSource" | "exportPreset";
  id: string;
  bookId?: string;
  deletedAt: number;
  deviceId: string;
}

/** 上次成功合并后的指纹（三方比较的 base） */
export interface BaseHashes {
  settings: string;
  books: Record<
    string,
    { schemaHash: string; exportSettingsHash: string; metaHash: string; studyConfigHash: string }
  >;
  lookupSources: Record<string, string>;
  dictionaries: Record<string, string>;
  exportPresets: Record<string, string>;
}

/** Gist 自动同步配置（存独立 IDB 的 SyncMeta，不进主库、不随同步载荷传播） */
export interface SyncGistConfig {
  /** 是否开启自动同步 */
  enabled: boolean;
  /** GitHub Token（fine-grained 或 classic，仅需 gist 权限） */
  token: string;
  /** 目标 Gist id：首次推送时自动创建，之后复用 */
  gistId: string | null;
  /** 配对码（人类可读的共享密钥；加密与配对标识同源） */
  pairCode: string;
  /** 上次推送内容的指纹（相同则跳过推送，省 gist 修订） */
  lastPushHash?: string | null;
  /** 连续失败次数（自动同步退避用；手动同步不受限） */
  failStreak?: number;
  /** 退避截止时间戳（自动同步在该时刻前不再自动重试） */
  backoffUntil?: number | null;
  /** 「重新创建」时排除的旧中转站 id（发现逻辑跳过；新建成功后可清空） */
  excludeGistIds?: string[];
}

/** 同步元数据（独立 IDB key：wulonvocab-sync-v1:meta） */
export interface SyncMeta {
  schema: 1;
  device: SyncDeviceInfo;
  /** pairId -> 游标 */
  cursors: Record<string, { pushed: string | null; pulled: string | null }>;
  base: BaseHashes | null;
  lastSyncAt: number | null;
  tombstones: SyncTombstone[];
  /** Gist 自动同步配置（P1；可选字段向后兼容） */
  gist?: SyncGistConfig | null;
}

/** 合并引擎的本地状态输入（与 store 的落盘形状一致） */
export interface SyncState {
  books: Wordbook[];
  settings: AppSettings;
  lookupSources: LookupSourceConfig[];
  dictionaries: LocalDictMeta[];
  exportPresets: ExportPreset[];
}

/** 同步载荷（合并引擎的唯一远端输入；文件/加密容器在其外层） */
export interface SyncPayloadV1 {
  mode: "snapshot" | "delta";
  /** delta：仅含 updatedAt > since 的条目（构建方加 5min 安全边距） */
  since: number | null;
  deviceId: string;
  books: { book: Omit<Wordbook, "entries">; entries?: Entry[] }[];
  tombstones: SyncTombstone[];
  settings?: SyncSettings;
  lookupSources?: LookupSourceConfig[];
  dictionaries?: LocalDictMeta[];
  /** 导出预设（旧版本载荷缺省 ⇒ 视为「未提供」，infer 不删本地） */
  exportPresets?: ExportPreset[];
  stats: { books: number; entries: number };
}

/** 同步包信封（文件 / 传输层的统一容器；P0 文件档 crypto=none，Gist 档一律 AES-GCM 密文） */
export interface SyncEnvelopeV1 {
  format: typeof SYNC_FORMAT;
  version: typeof SYNC_FORMAT_VERSION;
  kind: "snapshot" | "delta";
  packId: string;
  deviceId: string;
  hlc: string;
  baseCursor: string | null;
  pairId: string;
  createdAt: number;
  crypto:
    | { alg: "none" }
    | { alg: "AES-GCM"; iv: string; kdf: "PBKDF2-SHA256"; iter: number; gz: boolean };
  /** none：base64(JSON(payload))；AES-GCM：base64(AES-GCM(gzip(JSON(payload)))) */
  payload: string;
  checksum: string;
}

export interface MergeConflict {
  entityKey: string;
  kind: "entry" | "schema" | "exportSettings" | "studyConfig" | "settings" | "bookMeta" | "lookupSource" | "exportPreset";
  label: string;
  chosen: "local" | "remote";
  canFlip: boolean;
}

export interface MergeApplied {
  booksAdded: number;
  booksUpdated: number;
  booksDeleted: number;
  entriesAdded: number;
  entriesUpdated: number;
  entriesDeleted: number;
}

export interface MergeInput {
  local: SyncState;
  remote: SyncPayloadV1;
  meta: {
    base: BaseHashes | null;
    lastSyncAt: number | null;
    localDeviceId: string;
    remoteDeviceId: string;
    tombstones: SyncTombstone[];
    /** 当前时钟（提供则对墓碑做 180 天 TTL 裁剪；缺省不裁剪） */
    now?: number;
  };
  /** 人工裁决：entityKey -> 取值（对账界面翻转用） */
  resolutions?: Record<string, "local" | "remote">;
}

export interface MergeResult {
  state: SyncState;
  conflicts: MergeConflict[];
  applied: MergeApplied;
  nextBase: BaseHashes;
  nextTombstones: SyncTombstone[];
}
