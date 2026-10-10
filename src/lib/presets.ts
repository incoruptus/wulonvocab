import type {
  Entry,
  ExportSettings,
  Schema,
  SectionDef,
  SectionOptions,
  SectionType,
  SenseItem,
  Wordbook,
} from "./types";
import { makeSection } from "./sections";
import { formatDate, uid } from "./utils";

/* ============================================================
   导出默认设置
   ============================================================ */

export function defaultExportSettings(name = ""): ExportSettings {
  return {
    paper: "A5",
    orientation: "portrait",
    margin: { top: 14, right: 12, bottom: 14, left: 12, gutter: 0, mirror: false },
    tone: "white",
    columns: 1,
    columnGap: 8,
    layout: "flow",
    paginationMode: "align",
    grid: { columns: 2, rows: 4, showBorder: true, flashcard: false },
    cardStyle: "classic",
    fontFamily: "sans",
    fontScale: 1,
    lineHeight: 1.6,
    accent: "blue",
    entryGap: 6,
    writingLines: 0,
    showEntryNumber: false,
    continuationMark: true,
    sectionVisibility: {},
    hideEmpty: true,
    showSectionLabels: true,
    sortMode: "list",
    headwordCase: "as-is",
    cover: {
      enabled: false,
      title: name,
      subtitle: "WulonVocab 单词手册",
      author: "",
      dateText: formatDate(Date.now()),
      style: "minimal",
    },
    index: { enabled: false, title: "索引", columns: 2, showPageNumbers: true },
    footer: { pageNumbers: true, text: "", bookName: false },
  };
}

/* ============================================================
   Schema 预设模板
   ============================================================ */

interface SectionSeed {
  type: SectionType;
  key: string;
  label: string;
  icon?: string;
  color?: SectionOptions["color"];
  visible?: boolean;
  options?: SectionOptions;
}

function buildSchema(seeds: SectionSeed[], presetId: string): Schema {
  const sections: SectionDef[] = seeds.map((s, i) => ({
    ...makeSection({
      type: s.type,
      key: s.key,
      label: s.label,
      icon: s.icon,
      color: s.color,
      order: i,
      visible: s.visible ?? true,
      options: s.options,
    }),
    builtin: true,
  }));
  return { version: 1, presetId, sections };
}

const OXFORD_SEEDS: SectionSeed[] = [
  { type: "pronunciation", key: "phonetic", label: "音标", icon: "Volume2" },
  {
    type: "senses",
    key: "senses",
    label: "词性与释义",
    icon: "Layers",
    options: { showAntonyms: false },
  },
  { type: "keyvalue", key: "family", label: "词族", icon: "GitBranch" },
  { type: "transforms", key: "transforms", label: "词性变换", icon: "Repeat" },
  { type: "list", key: "collocations", label: "常用搭配", icon: "List" },
  { type: "list", key: "associations", label: "联想与助记", icon: "Lightbulb" },
  { type: "tags", key: "contexts", label: "情景标签", icon: "Tag", color: "teal" },
  { type: "examples", key: "examplesExtra", label: "情景例句", icon: "Quote" },
  { type: "markdown", key: "notes", label: "学习笔记", icon: "AlignLeft" },
  { type: "text", key: "etymology", label: "词源", icon: "BookOpen", options: { prefix: "词源" } },
];

const MINIMAL_SEEDS: SectionSeed[] = [
  { type: "pronunciation", key: "phonetic", label: "音标", icon: "Volume2" },
  {
    type: "senses",
    key: "senses",
    label: "释义",
    icon: "Layers",
    options: {
      showDefinition: false,
      showUsage: false,
      showPatterns: false,
      showSynonyms: false,
      showCollocations: false,
      showNotes: false,
      groupByPos: true,
      posStyle: "badge",
    },
  },
  { type: "transforms", key: "transforms", label: "词性变换", icon: "Repeat", options: { showNote: false } },
  { type: "tags", key: "contexts", label: "情景标签", icon: "Tag", color: "violet" },
];

const EXAM_SEEDS: SectionSeed[] = [
  { type: "pronunciation", key: "phonetic", label: "音标", icon: "Volume2" },
  {
    type: "senses",
    key: "senses",
    label: "考点释义",
    icon: "Layers",
    options: {
      showUsage: false,
      showNotes: true,
      showCollocations: true,
      showAntonyms: true,
      posStyle: "badge",
    },
  },
  { type: "keyvalue", key: "family", label: "词族", icon: "GitBranch" },
  { type: "transforms", key: "transforms", label: "词性变换", icon: "Repeat" },
  { type: "list", key: "collocations", label: "高频搭配", icon: "List" },
  { type: "tags", key: "contexts", label: "情景标签", icon: "Tag", color: "amber" },
  { type: "quote", key: "pitfall", label: "易错提醒", icon: "Info", options: { tone: "warning" } },
];

const READING_SEEDS: SectionSeed[] = [
  { type: "pronunciation", key: "phonetic", label: "音标", icon: "Volume2" },
  { type: "senses", key: "senses", label: "词性与释义", icon: "Layers" },
  { type: "examples", key: "examplesExtra", label: "语境例句", icon: "Quote" },
  { type: "keyvalue", key: "family", label: "词族", icon: "GitBranch" },
  { type: "transforms", key: "transforms", label: "词性变换", icon: "Repeat" },
  { type: "table", key: "discrimination", label: "近义辨析", icon: "Table2" },
  { type: "list", key: "associations", label: "词根与联想", icon: "Lightbulb" },
  { type: "tags", key: "contexts", label: "情景标签", icon: "Tag", color: "green" },
  { type: "markdown", key: "notes", label: "阅读笔记", icon: "AlignLeft" },
  { type: "text", key: "etymology", label: "词源", icon: "BookOpen", options: { prefix: "词源" } },
];

export interface SchemaPreset {
  id: string;
  name: string;
  description: string;
  build: () => Schema;
}

export const SCHEMA_PRESETS: SchemaPreset[] = [
  {
    id: "oxford",
    name: "牛津词典风",
    description: "音标 + 词性释义 + 词族 + 词性变换 + 搭配 + 联想 + 情景标签，接近纸本词典的完整结构",
    build: () => buildSchema(OXFORD_SEEDS, "oxford"),
  },
  {
    id: "minimal",
    name: "极简记忆卡",
    description: "只保留释义与情景标签，版面清爽，适合快速记忆与自测",
    build: () => buildSchema(MINIMAL_SEEDS, "minimal"),
  },
  {
    id: "exam",
    name: "考试冲刺",
    description: "突出考点释义、高频搭配与易错提醒，面向四六级 / 考研 / 雅思托福",
    build: () => buildSchema(EXAM_SEEDS, "exam"),
  },
  {
    id: "reading",
    name: "深度阅读",
    description: "语境例句 + 近义辨析表 + 阅读笔记，面向精读与写作积累",
    build: () => buildSchema(READING_SEEDS, "reading"),
  },
  {
    id: "blank",
    name: "空白自定义",
    description: "从零开始，自行添加任意字段",
    build: () => ({ version: 1, presetId: "blank", sections: [] }),
  },
];

export function defaultSchema(): Schema {
  return SCHEMA_PRESETS[0].build();
}

export function getPreset(id: string | undefined): SchemaPreset | undefined {
  return SCHEMA_PRESETS.find((p) => p.id === id);
}

/* ============================================================
   词条构造工具
   ============================================================ */

export function blankSense(pos = ""): SenseItem {
  return {
    id: uid(),
    pos,
    translation: "",
    definition: "",
    examples: [],
    usage: "",
    patterns: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    notes: "",
  };
}

export function makeEntry(partial: Partial<Entry> & { headword: string }): Entry {
  const now = Date.now();
  return {
    id: partial.id ?? uid(),
    headword: partial.headword.trim(),
    tags: partial.tags ?? [],
    status: partial.status ?? "new",
    starred: partial.starred ?? false,
    values: partial.values ?? {},
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    source: partial.source,
    srs: partial.srs,
  };
}

/* ============================================================
   示例词库
   ============================================================ */

export function createSampleBook(): Wordbook {
  const now = Date.now();
  const schema = defaultSchema();
  const entries: Entry[] = [
    makeEntry({
      headword: "abandon",
      tags: ["cet4", "ky"],
      starred: true,
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/əˈbændən/", us: "/əˈbændən/" },
        senses: [
          {
            id: uid(),
            pos: "v.",
            translation: "抛弃；遗弃（尤指对你有责任的人）",
            definition:
              "to leave somebody, especially somebody you are responsible for, with no intention of returning",
            examples: [
              { en: "The baby had been abandoned by its mother.", zh: "这个婴儿被母亲遗弃了。", source: "OALD" },
              { en: "People often simply abandon their pets when they go abroad.", zh: "人们出国时常常就这么遗弃宠物。" },
            ],
            usage: "常用被动语态 be abandoned by；过去分词 abandoned 常作形容词「被遗弃的」。",
            patterns: ["abandon sb/sth", "abandon sb to sth"],
            synonyms: ["desert", "leave", "forsake"],
            antonyms: [],
            collocations: ["abandon sb to their fate 让某人听天由命"],
            notes: "",
          },
          {
            id: uid(),
            pos: "v.",
            translation: "（因危险或无法停留而）放弃，离开，舍弃",
            definition:
              "to leave a thing or place, especially because it is impossible or dangerous to stay",
            examples: [
              { en: "Snow forced many drivers to abandon their vehicles.", zh: "大雪迫使许多司机弃车而行。", source: "OALD" },
              { en: "He gave the order to abandon ship.", zh: "他下令弃船。", source: "OALD" },
            ],
            usage: "",
            patterns: ["abandon sth", "abandon ship"],
            synonyms: ["evacuate", "leave behind"],
            antonyms: [],
            collocations: ["be forced to abandon sth 被迫放弃某物"],
            notes: "",
          },
          {
            id: uid(),
            pos: "v.",
            translation: "中止，放弃（未完成的事）；放弃（希望）",
            definition:
              "to stop doing something, especially before it is finished; to stop having something",
            examples: [
              { en: "They abandoned the match because of rain.", zh: "因下雨他们中止了比赛。", source: "OALD" },
              { en: "She abandoned hope of any reconciliation.", zh: "她放弃了任何和解的希望。" },
            ],
            usage: "高考 / 考研高频考点：abandon hope（放弃希望）、abandon oneself to（沉溺于）。",
            patterns: ["abandon sth", "abandon hope of sth", "abandon oneself to sth"],
            synonyms: ["give up", "drop", "scrap"],
            antonyms: ["continue", "maintain"],
            collocations: ["abandon hope 放弃希望", "altogether abandon sth 彻底放弃"],
            notes: "",
          },
        ],
        family: [
          { key: "abandonment", value: "n. 遗弃；放弃；中止" },
          { key: "abandoned", value: "adj. 被遗弃的；废弃的" },
          { key: "abandon", value: "n. 放纵；放任（with gay abandon 纵情地）" },
        ],
        transforms: [
          { form: "abandons", pos: "v.", note: "第三人称单数" },
          { form: "abandoned", pos: "v.", note: "过去式 / 过去分词" },
          { form: "abandoning", pos: "v.", note: "现在分词" },
        ],
        collocations: ["with gay abandon 纵情地；无所顾忌地", "abandon ship 弃船"],
        associations: [
          "a（一个）+ band（带子）+ on（在…上）：一条带子被丢在路边无人认领 → 抛弃、遗弃",
          "词根 band = 控制：a + bandon，交出控制权 → 放弃",
        ],
        contexts: ["新闻", "文学", "考研阅读"],
        examplesExtra: [
          {
            en: "The plans for reform were quietly abandoned.",
            zh: "改革方案被悄然放弃。",
            source: "考研真题例句",
          },
        ],
        notes: "**记忆钩子**：abandon 与 abundant（大量的）只差一个字母，abandon 是「丢掉」，abundant 是「多得丢不完」。",
        etymology: "源自古法语 abandoner，a-（置于）+ bandon（控制），本义「交出控制权」。",
      },
    }),
    makeEntry({
      headword: "resilient",
      tags: ["ielts", "toefl"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/rɪˈzɪliənt/", us: "/rɪˈzɪliənt/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "有韧性的；能迅速恢复的；适应力强的",
            definition: "able to recover quickly after something unpleasant such as shock, injury, etc.",
            examples: [
              { en: "Children are often more resilient than adults.", zh: "孩子们往往比大人恢复得更快。" },
              { en: "a resilient economy", zh: "韧性十足的经济", source: "经济学人例句" },
            ],
            usage: "常与 be resilient to 搭配；名词形式 resilience 是雅思写作高频词。",
            patterns: ["be resilient to sth", "a resilient economy/community"],
            synonyms: ["tough", "hardy", "adaptable"],
            antonyms: ["fragile", "vulnerable"],
            collocations: ["resilient economy 有韧性的经济"],
            notes: "",
          },
        ],
        family: [
          { key: "resilience", value: "n. 韧性；恢复力；适应力" },
          { key: "resiliently", value: "adv. 有韧性地" },
        ],
        transforms: [
          { form: "more resilient", pos: "adj.", note: "比较级" },
          { form: "most resilient", pos: "adj.", note: "最高级" },
        ],
        collocations: ["build resilience 增强韧性"],
        associations: ["re（回）+ sil（跳）+ ient：能「弹回来」 → 有韧性的、恢复力强的"],
        contexts: ["雅思写作", "心理学", "经济报道"],
        examplesExtra: [],
        notes: "",
        etymology: "拉丁语 resilire（跳回），re-（回）+ salire（跳）。",
      },
    }),
    makeEntry({
      headword: "comprehensive",
      tags: ["cet4", "ky", "ielts"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/ˌkɒmprɪˈhensɪv/", us: "/ˌkɑːmprɪˈhensɪv/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "全面的；综合的；包罗万象的",
            definition: "including everything that is necessary; complete",
            examples: [
              { en: "a comprehensive study of the subject", zh: "对该课题的全面研究", source: "OALD" },
              { en: "a comprehensive insurance policy", zh: "综合保险单", source: "OALD" },
            ],
            usage: "",
            patterns: ["a comprehensive guide to sth", "comprehensive in scope"],
            synonyms: ["thorough", "extensive", "all-inclusive"],
            antonyms: ["partial", "limited", "selective"],
            collocations: ["comprehensive review 全面审查"],
            notes: "辨析：comprehensive=覆盖全；comprehensible=能被理解的。",
          },
        ],
        family: [
          { key: "comprehend", value: "v. 理解；领会" },
          { key: "comprehension", value: "n. 理解（力）；阅读理解练习" },
          { key: "comprehensible", value: "adj. 可理解的；易懂的" },
          { key: "comprehensively", value: "adv. 全面地" },
        ],
        transforms: [
          { form: "more comprehensive", pos: "adj.", note: "比较级" },
          { form: "most comprehensive", pos: "adj.", note: "最高级" },
        ],
        collocations: ["comprehensive insurance 综合险"],
        associations: ["com（共同）+ prehend（抓住）+ ive：全都能抓住 → 全面的"],
        contexts: ["教育", "保险", "报告写作"],
        examplesExtra: [],
        notes: "**混淆提醒**：-ive 是「全面的」，-ible 是「可理解的」。",
        etymology: "拉丁语 comprehendere（抓住），com-（一起）+ prehendere（抓住）。",
      },
    }),
  ];

  return {
    id: uid(),
    name: "示例词库 · 核心 3 词",
    description: "内置示例：3 个词，10 个字段全部用上。随便改、随便删，用来熟悉流程最合适。",
    tags: ["示例"],
    createdAt: now,
    updatedAt: now,
    schema,
    entries,
    exportSettings: defaultExportSettings("示例词库 · 核心 3 词"),
    meta: { language: "en", level: "CET4 / 考研", coverEmoji: "📖" },
  };
}

export function createEmptyBook(name: string, schema?: Schema): Wordbook {
  const now = Date.now();
  return {
    id: uid(),
    name,
    description: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
    schema: schema ?? defaultSchema(),
    entries: [],
    exportSettings: defaultExportSettings(name),
  };
}
