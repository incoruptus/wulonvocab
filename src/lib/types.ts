/**
 * WulonVocab 领域模型
 * ------------------------------------------------------------------
 * 设计原则：
 * 1. 一切内容围绕「字段（Section）」组织：词条不预设固定字段，
 *    由 Schema 描述字段清单，渲染器/编辑器按 Schema 动态生成 UI。
 * 2. 每种字段类型（SectionType）拥有确定的「规范值形态」（canonical value shape），
 *    导入任何来源的数据都会经过 normalize 收敛到规范形态。
 * 3. Schema 中不存在的键不会被丢弃：保留在 entry.values 中，
 *    并在编辑器中提示用户「提升为字段」。
 */

// ============================================================
// 纸张与版面
// ============================================================

export type PaperId = "A4" | "A5" | "B5iso" | "B5jis" | "16K" | "32K" | "custom";

export interface PaperSize {
  id: PaperId;
  name: string;
  /** mm */
  width: number;
  /** mm */
  height: number;
  note?: string;
}

export type Orientation = "portrait" | "landscape";

export type PaperTone = "white" | "cream" | "gray";

export type AccentId = "blue" | "violet" | "teal" | "amber" | "rose" | "green" | "gray";

export interface MarginSetting {
  /** mm */
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** 装订边额外留白（mm），与 mirror 配合实现奇偶页镜像 */
  gutter: number;
  /** 双面打印时镜像左右边距 */
  mirror: boolean;
}

/** 导出卡片主题（=结构骨架，见 docs/research/themes-2026-10.md） */
export type CardStyle = "dictionary" | "swiss" | "notebook" | "flashcard";

// ============================================================
// 字段体系（动态字段管理核心）
// ============================================================

export type SectionType =
  | "text"
  | "markdown"
  | "list"
  | "tags"
  | "pronunciation"
  | "senses"
  | "examples"
  | "keyvalue"
  | "transforms"
  | "table"
  | "image"
  | "quote"
  | "rating"
  | "divider";

export interface SectionOptions {
  // text
  prefix?: string;
  // list
  ordered?: boolean;
  // tags
  color?: AccentId;
  // pronunciation
  showUk?: boolean;
  showUs?: boolean;
  showAudio?: boolean;
  // senses
  groupByPos?: boolean;
  posStyle?: "badge" | "plain" | "inline";
  showDefinition?: boolean;
  showTranslation?: boolean;
  showExamples?: boolean;
  showUsage?: boolean;
  showPatterns?: boolean;
  showSynonyms?: boolean;
  showAntonyms?: boolean;
  showCollocations?: boolean;
  showNotes?: boolean;
  // examples
  showZh?: boolean;
  numbering?: boolean;
  // keyvalue
  keyLabel?: string;
  valueLabel?: string;
  inline?: boolean;
  // transforms
  showPos?: boolean;
  showNote?: boolean;
  // table
  zebra?: boolean;
  headerRow?: boolean;
  // image
  imageHeight?: number;
  showCaption?: boolean;
  // quote
  tone?: "info" | "tip" | "warning";
  // rating
  max?: number;
  label?: string;
  style?: "stars" | "dots";
  // divider
  dividerStyle?: "solid" | "dashed" | "dotted";
  // markdown
  placeholder?: string;
}

export interface SectionDef {
  id: string;
  /** 数据键：entry.values[key] 的键，Schema 内唯一 */
  key: string;
  /** 显示名：卡片与编辑器中展示 */
  label: string;
  type: SectionType;
  /** lucide 图标名 */
  icon?: string;
  /** 强调色（用于标签、标记、分隔线） */
  color?: AccentId;
  order: number;
  /** 全局显示开关（导出/预览；schema 内不改排序） */
  visible: boolean;
  /** 内置字段（来自模板，可删除但会有提示） */
  builtin?: boolean;
  description?: string;
  /** 是否在导出卡片中占据整行（默认 true）；false 时相邻字段可并排 */
  fullWidth?: boolean;
  options: SectionOptions;
}

export interface Schema {
  version: 1;
  /** 字段模板来源（用于界面展示） */
  presetId?: string;
  sections: SectionDef[];
}

// -------- 各字段类型的规范值形态 --------

export interface PronunciationValue {
  uk?: string;
  us?: string;
  audioUk?: string;
  audioUs?: string;
}

export interface ExampleItem {
  en: string;
  zh?: string;
  source?: string;
}

export interface SenseItem {
  id: string;
  /** 词性，如 v. / n. / adj. */
  pos: string;
  /** 目标语言释义（中文） */
  translation: string;
  /** 源语言释义（英文） */
  definition: string;
  examples: ExampleItem[];
  usage: string;
  patterns: string[];
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  notes: string;
  /** 内部标记：渲染分页续块（仅存在于切片克隆中，不入库） */
  cont?: boolean;
  /** 内部标记：原始义项序号（0 基，仅存在于切片克隆中）——跨页连续编号 */
  printNo?: number;
}

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface TransformItem {
  form: string;
  pos?: string;
  note?: string;
}

export interface TableValue {
  columns: string[];
  rows: string[][];
}

export interface ImageValue {
  url: string;
  caption?: string;
}

export interface RatingValue {
  value: number;
  max: number;
  label?: string;
}

export type SectionValue =
  | string
  | string[]
  | PronunciationValue
  | SenseItem[]
  | ExampleItem[]
  | KeyValueItem[]
  | TransformItem[]
  | TableValue
  | ImageValue[]
  | RatingValue
  | null;

// ============================================================
// 词条
// ============================================================

export type EntryStatus = "new" | "learning" | "mastered";

export type EntrySourceKind = "manual" | "import" | "lookup" | "ai";

export interface EntrySource {
  kind: EntrySourceKind;
  label?: string;
  at: number;
}

export interface Entry {
  id: string;
  headword: string;
  /** 词条级标签：用于列表筛选（与「情景标签」字段相互独立） */
  tags: string[];
  status: EntryStatus;
  starred: boolean;
  /** sectionKey -> 规范值（可能包含 Schema 之外的键，不丢数据） */
  values: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  source?: EntrySource;
  /** 学习调度状态（SRS，见 lib/study） */
  srs?: import("./study/types").StudySrs;
}

// ============================================================
// 词库（Wordbook）
// ============================================================

export interface WordbookMetaInfo {
  language?: string;
  level?: string;
  coverEmoji?: string;
}

export interface Wordbook {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  schema: Schema;
  entries: Entry[];
  exportSettings: ExportSettings;
  meta?: WordbookMetaInfo;
  /** 学习（SRS）配置与每日记录 */
  study?: import("./study/types").BookStudy;
}

// ============================================================
// 导出设置
// ============================================================

export interface CoverSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  author: string;
  dateText: string;
  style: "minimal" | "band" | "boxed" | "typewriter";
}

export interface IndexSettings {
  enabled: boolean;
  title: string;
  columns: number;
  showPageNumbers: boolean;
}

export interface FooterSettings {
  pageNumbers: boolean;
  text: string;
  bookName: boolean;
}

export interface GridSettings {
  columns: number;
  rows: number;
  showBorder: boolean;
  /** 网格模式下是否只显示「头部 + 首字段」的闪卡样式 */
  flashcard: boolean;
  /** 网格间距 mm（普通网格 4；闪卡主题 10） */
  gapMm: number;
}

export interface ExportSettings {
  paper: PaperId;
  customPaper?: { width: number; height: number };
  orientation: Orientation;
  margin: MarginSetting;
  tone: PaperTone;
  /** flow 模式列数（仿词典双栏） */
  columns: 1 | 2 | 3;
  columnGap: number;
  layout: "flow" | "grid";
  /** 分页模式：align=题头与页首对齐；continuous=连续填充（尽量占满每页） */
  paginationMode: "align" | "continuous";
  grid: GridSettings;
  cardStyle: CardStyle;
  fontFamily: "sans" | "serif";
  /** 0.85 – 1.3 */
  fontScale: number;
  lineHeight: number;
  accent: AccentId;
  /** flow 模式词条间距 mm */
  entryGap: number;
  /** notebook 风格：词条后留手写横线 */
  writingLines: number;
  showEntryNumber: boolean;
  continuationMark: boolean;
  /** sectionId -> 是否在导出中显示（覆盖 schema.visible） */
  sectionVisibility: Record<string, boolean>;
  /** 空字段是否隐藏（false 时显示字段名留白，便于手写式词卡） */
  hideEmpty: boolean;
  /** 导出字段小标题 */
  showSectionLabels: boolean;
  /** 词条排序：list=当前列表顺序，az=字母序 */
  sortMode: "list" | "az";
  headwordCase: "as-is" | "lower" | "upper" | "title";
  cover: CoverSettings;
  index: IndexSettings;
  footer: FooterSettings;
}

// ============================================================
// 应用设置
// ============================================================

/** 导出预设：命名的整套导出设置方案（全局共享，可跨词库套用；随跨端同步） */
export interface ExportPreset {
  id: string;
  name: string;
  settings: ExportSettings;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  accent: AccentId;
  uiScale: number;
  sidebarCollapsed: boolean;
  lastBookId: string | null;
  /** 最近一次本地修改时间（同步冲突按「较新变更胜」；0 / 缺省 = 从未改过） */
  updatedAt?: number;
}

// ============================================================
// 词库检索（Lookup）
// ============================================================

export type LookupKind = "freedict" | "localdict" | "http" | "ai" | "zerodict" | "youdao";

export interface LookupSourceConfig {
  id: string;
  kind: LookupKind;
  label: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface LocalDictMeta {
  id: string;
  name: string;
  source: string;
  count: number;
  importedAt: number;
  note?: string;
}

export interface LookupDraft {
  /** sectionKey -> 原始值（将由 Schema 类型归一化） */
  values: Record<string, unknown>;
  suggestedTags?: string[];
  schemaSections?: SectionDef[];
  /** 用于检索结果卡片预览的摘要信息 */
  summary?: {
    headword: string;
    phonetic?: string;
    posList?: string[];
    definitions?: string[];
  };
}

export interface LookupResult {
  sourceId: string;
  sourceLabel: string;
  kind: LookupKind;
  word: string;
  ok: boolean;
  draft?: LookupDraft;
  error?: string;
  tookMs: number;
  raw?: unknown;
  /** 结果来自本地缓存（可「重新检索」刷新） */
  fromCache?: boolean;
}

// ============================================================
// 导出文档（格式互操作）
// ============================================================

export const WULONVOCAB_FORMAT = "wulonvocab" as const;
export const WULONVOCAB_VERSION = 1 as const;

export interface WulonDoc {
  format?: typeof WULONVOCAB_FORMAT;
  version?: number;
  wordbook?: {
    name?: string;
    description?: string;
    tags?: string[];
    meta?: WordbookMetaInfo;
  };
  schema?: Schema | { sections: SectionDef[] };
  entries: unknown[];
}
