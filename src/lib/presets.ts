import type {
  Entry,
  ExportSettings,
  ImageValue,
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
    grid: { columns: 2, rows: 4, showBorder: true, flashcard: false, gapMm: 4 },
    cardStyle: "dictionary",
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

/** 示例配图：内置 SVG 数据 URL（160×90 · 系列插画；不依赖网络、随书保存） */
function sampleIllustration(): ImageValue[] {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">` +
    `<rect width="160" height="90" rx="10" fill="#eef1f5"/>` +
    `<rect x="16" y="22" width="44" height="5" rx="2.5" fill="#b9c2cc"/>` +
    `<rect x="16" y="35" width="72" height="4" rx="2" fill="#cfd6de"/>` +
    `<rect x="16" y="46" width="60" height="4" rx="2" fill="#cfd6de"/>` +
    `<rect x="16" y="57" width="66" height="4" rx="2" fill="#cfd6de"/>` +
    `<text x="128" y="58" font-family="Georgia, serif" font-size="26" font-style="italic" fill="#9aa4b0">Aa</text>` +
    `<text x="128" y="74" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#b3bcc6">WulonVocab</text>` +
    `</svg>`;
  return [{ url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, caption: "系列插画 · 可替换为本机图片" }];
}

/** 示例词库的字段表：全部 14 种字段类型各就位（divider 为装饰线、无需数据）；
 *  各字段的显示选项一律全开（含「显示备注 / 搭配 / 反义词」等），把能力展示完整 */
const SAMPLE_SEEDS: SectionSeed[] = [
  { type: "pronunciation", key: "phonetic", label: "音标", icon: "Volume2" },
  {
    type: "senses",
    key: "senses",
    label: "词性与释义",
    icon: "Layers",
    options: {
      groupByPos: true,
      showTranslation: true,
      showDefinition: true,
      showExamples: true,
      showUsage: true,
      showPatterns: true,
      showCollocations: true,
      showSynonyms: true,
      showAntonyms: true,
      showNotes: true,
    },
  },
  { type: "rating", key: "frequency", label: "考频", icon: "Flame", options: { label: "考频", max: 5 } },
  { type: "quote", key: "pitfall", label: "易错提醒", icon: "Info", options: { tone: "warning" } },
  { type: "table", key: "discrimination", label: "近义辨析", icon: "Table2" },
  { type: "keyvalue", key: "family", label: "词族", icon: "GitBranch", options: { inline: true } },
  { type: "transforms", key: "transforms", label: "词性变换", icon: "Repeat" },
  { type: "list", key: "collocations", label: "常用搭配", icon: "List", options: { ordered: true } },
  { type: "tags", key: "contexts", label: "情景标签", icon: "Tag", color: "teal" },
  { type: "list", key: "associations", label: "联想与助记", icon: "Lightbulb", options: { ordered: true } },
  { type: "examples", key: "examplesExtra", label: "情景例句", icon: "Quote", options: { numbering: true } },
  { type: "image", key: "illustration", label: "配图", icon: "Image" },
  { type: "divider", key: "divider", label: "分隔线", icon: "Minus" },
  { type: "markdown", key: "notes", label: "学习笔记", icon: "AlignLeft" },
  { type: "text", key: "etymology", label: "词源", icon: "BookOpen", options: { prefix: "词源" } },
];

export function createSampleBook(): Wordbook {
  const now = Date.now();
  const schema = buildSchema(SAMPLE_SEEDS, "sample");
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
            definition: "to leave someone you should take care of, and never come back",
            examples: [
              { en: "He abandoned his family and moved to another city.", zh: "他抛下家人，搬去了另一座城市。" },
              { en: "Some owners abandon their dogs when moving house.", zh: "有些主人搬家时就把狗遗弃了。" },
            ],
            usage: "常用被动语态 be abandoned by；过去分词 abandoned 常作形容词「被遗弃的」。",
            patterns: ["abandon sb/sth", "abandon sb to sth"],
            synonyms: ["desert", "leave", "forsake"],
            antonyms: ["keep", "maintain"],
            collocations: ["abandon sb to their fate 让某人听天由命"],
            notes: "注意形容词化用法：an abandoned building（废弃建筑）。",
          },
          {
            id: uid(),
            pos: "v.",
            translation: "（因危险或无法停留而）放弃，离开，舍弃",
            definition: "to leave a place or thing because staying is impossible or dangerous",
            examples: [
              { en: "The crew abandoned the burning ship in the storm.", zh: "暴风雨中，船员们弃下了起火的船。" },
              { en: "Thick fog forced the climbers to abandon their route.", zh: "浓雾迫使登山者放弃了原定路线。" },
            ],
            usage: "常见于新闻与灾难报道；abandon ship（弃船）是固定说法。",
            patterns: ["abandon sth", "abandon ship"],
            synonyms: ["evacuate", "leave behind"],
            antonyms: ["remain", "stay"],
            collocations: ["be forced to abandon sth 被迫放弃某物"],
            notes: "灾难与军事报道里的高频义项，常与 crew、ship 同框。",
          },
          {
            id: uid(),
            pos: "v.",
            translation: "中止，放弃（未完成的事）；放弃（希望）",
            definition:
              "to stop doing something before it is finished, or to give up hope",
            examples: [
              { en: "The search was abandoned after night fell.", zh: "天黑之后，搜寻工作停止了。" },
              { en: "He never abandoned hope of finding his brother.", zh: "他从未放弃找到弟弟的希望。" },
            ],
            usage: "高考 / 考研高频考点：abandon hope（放弃希望）、abandon oneself to（沉溺于）。",
            patterns: ["abandon sth", "abandon hope of sth", "abandon oneself to sth"],
            synonyms: ["give up", "drop", "scrap"],
            antonyms: ["continue", "maintain"],
            collocations: ["abandon hope 放弃希望", "altogether abandon sth 彻底放弃"],
            notes: "abandon hope 为固定短语，hope 前不加 the。",
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
            source: "自撰例句",
          },
        ],
        notes: "**记忆钩子**：abandon 与 abundant（大量的）只差一个字母，abandon 是「丢掉」，abundant 是「多得丢不完」。",
        etymology: "源自古法语 abandoner，a-（置于）+ bandon（控制），本义「交出控制权」。",
        frequency: { value: 5, max: 5 },
        pitfall: "拼写警报：abandon 是「丢掉」，abundant 是「多得丢不完」；丢掉 u 才是 abandon。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["abandon", "彻底丢下，此后不再管", "abandon a plan"],
            ["desert", "违背责任地离开", "desert one's post"],
            ["quit", "主动停止，语气中性", "quit a job"],
          ],
        },
        illustration: sampleIllustration(),
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
            definition: "able to recover quickly from difficulties or setbacks",
            examples: [
              { en: "Children are often more resilient than adults.", zh: "孩子们往往比大人恢复得更快。" },
              { en: "a resilient economy", zh: "韧性十足的经济" },
            ],
            usage: "常与 be resilient to 搭配；名词形式 resilience 是雅思写作高频词。",
            patterns: ["be resilient to sth", "a resilient economy/community"],
            synonyms: ["tough", "hardy", "adaptable"],
            antonyms: ["fragile", "vulnerable"],
            collocations: ["resilient economy 有韧性的经济"],
            notes: "名词 resilience 常作主语：Resilience matters more than talent.",
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
        examplesExtra: [
          {
            en: "The team stayed resilient after two failed attempts.",
            zh: "两次失败之后，团队依然很快恢复了状态。",
            source: "自撰例句",
          },
        ],
        notes: "**写作加分**：resilience 是雅思与考研写作的高频名词，常与 build、strengthen 连用（build resilience 增强韧性）。",
        etymology: "拉丁语 resilire（跳回），re-（回）+ salire（跳）。",
        frequency: { value: 4, max: 5 },
        pitfall: "拼写易错：resilient 中间是 -sili-（来自 salire「跳」），不是 -sila-。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["resilient", "受挫后能快速恢复", "a resilient community"],
            ["tough", "结实、抗造，偏物理", "a tough material"],
            ["robust", "强健稳固，也用于系统", "a robust system"],
          ],
        },
        illustration: sampleIllustration(),
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
            definition: "covering all the necessary parts; complete",
            examples: [
              { en: "The report gives a comprehensive view of the market.", zh: "这份报告对市场做了全面观察。" },
              { en: "The course covers a comprehensive range of topics.", zh: "这门课程涵盖的话题非常全面。" },
            ],
            usage: "可修饰 report / review / plan 等；反义常用 partial（片面的）。",
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
        examplesExtra: [
          {
            en: "She gave a comprehensive account of the accident.",
            zh: "她把事故的来龙去脉完整地讲了一遍。",
            source: "自撰例句",
          },
        ],
        notes: "**混淆提醒**：-ive 是「全面的」，-ible 是「可理解的」。",
        etymology: "拉丁语 comprehendere（抓住），com-（一起）+ prehendere（抓住）。",
        frequency: { value: 5, max: 5 },
        pitfall: "辨析：comprehensive 说的是「覆盖得全」，comprehensible 说的是「能被读懂」，一个字母之差、意思各走一边。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["comprehensive", "覆盖面广、成体系", "a comprehensive review"],
            ["thorough", "细到底、无遗漏", "a thorough check"],
            ["overall", "总体的、算总账", "overall performance"],
          ],
        },
        illustration: sampleIllustration(),
      },
    }),
    makeEntry({
      headword: "subtle",
      tags: ["cet4", "ky", "ielts"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/ˈsʌtl/", us: "/ˈsʌtl/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "微妙的；不易察觉的；精妙的",
            definition: "not obvious, and therefore difficult to notice, but important",
            examples: [
              { en: "There is a subtle difference between the two words.", zh: "这两个词之间有很细微的差别。" },
              { en: "The dish has a subtle flavor of lemon.", zh: "这道菜带一点淡淡的柠檬味。" },
            ],
            usage: "常搭配 subtle difference / subtle change / subtle hint；副词形式是 subtly。",
            patterns: ["a subtle difference/change", "subtly different"],
            synonyms: ["slight", "delicate", "nuanced"],
            antonyms: ["obvious", "blatant"],
            collocations: ["a subtle difference 细微差别", "subtle nuances 微妙之处"],
            notes: "图表写作里常修饰 difference / shift / rise。",
          },
        ],
        frequency: { value: 5, max: 5 },
        pitfall: "拼写注意：subtle 里的 b 不发音（读 /ˈsʌtl/），别把 subject、subtitle 的记忆串过来。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["subtle", "不易察觉且有讲究", "a subtle hint"],
            ["slight", "量上很小，语气中性", "a slight delay"],
            ["delicate", "精细、需要拿捏", "a delicate balance"],
          ],
        },
        family: [
          { key: "subtly", value: "adv. 微妙地；难以察觉地" },
          { key: "subtlety", value: "n. 微妙之处；精妙" },
        ],
        transforms: [
          { form: "subtler", pos: "adj.", note: "比较级" },
          { form: "subtlest", pos: "adj.", note: "最高级" },
        ],
        collocations: ["a subtle difference 细微的差别", "subtle nuances 细微的意味"],
        contexts: ["阅读", "写作", "文学"],
        associations: ["sub（在下）+ tle：藏在下面、看不出来 → 微妙的、不易察觉的"],
        examplesExtra: [
          { en: "Writers use subtle wording to leave room for interpretation.", zh: "作家用微妙的措辞给读者留下解读空间。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**写作场景**：评价语言、图表或情绪里的小变化，用 subtle 显得考究，如 a subtle shift in tone（语气的细微转变）。",
        etymology: "源自拉丁语 subtilis（细密的、精织的），sub-（在下）+ tela（织线），本义「织得很细」。",
      },
    }),
    makeEntry({
      headword: "coherent",
      tags: ["ky", "toefl"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/kəʊˈhɪərənt/", us: "/koʊˈhɪrənt/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "连贯的；条理清楚的；（物理）相干的",
            definition: "clear, logical and well organized, so that it is easy to understand",
            examples: [
              { en: "She was too upset to give a coherent account of the accident.", zh: "她太难过，说不清楚事故经过。" },
              { en: "The essay is coherent from beginning to end.", zh: "这篇文章从开头到结尾一气贯通。" },
            ],
            usage: "形容论述、计划与文本的整体一致性；名词 coherence，副词 coherently。",
            patterns: ["a coherent argument/strategy", "coherent with sth"],
            synonyms: ["logical", "consistent", "well-organized"],
            antonyms: ["incoherent", "confused"],
            collocations: ["a coherent narrative 连贯的叙事", "logically coherent 逻辑上自洽"],
            notes: "名词 coherence 常与 structural 连用：structural coherence。",
          },
        ],
        frequency: { value: 4, max: 5 },
        pitfall: "词族区分：coherent 说的是「读得通、连得起来」；cohesive 说的是「有凝聚力、抱得紧」。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["coherent", "整体读得通、连贯", "a coherent essay"],
            ["logical", "推理一环扣一环", "a logical conclusion"],
            ["consistent", "前后一致、不变", "consistent with earlier data"],
          ],
        },
        family: [
          { key: "coherence", value: "n. 连贯性；条理" },
          { key: "coherently", value: "adv. 有条理地" },
          { key: "incoherent", value: "adj. 语无伦次的；不连贯的" },
        ],
        transforms: [
          { form: "more coherent", pos: "adj.", note: "比较级" },
          { form: "most coherent", pos: "adj.", note: "最高级" },
        ],
        collocations: ["a coherent whole 统一的整体", "policy-coherent 政策上前后一致的"],
        contexts: ["写作", "语言学", "报告"],
        associations: ["co（共同）+ her（粘住）+ ent：所有部分粘在一起 → 连贯的"],
        examplesExtra: [
          { en: "A coherent plan is easier to carry out than a pile of brilliant ideas.", zh: "一份连贯的计划，比一堆漂亮点子更好落地。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**备考提示**：写作评分里的 coherence 是明确采分点。衔接词只是表面功夫，核心是「论点一路走到底」。",
        etymology: "拉丁语 cohaerere（粘在一起），co-（共同）+ haerere（粘附）。",
      },
    }),
    makeEntry({
      headword: "incentive",
      tags: ["cet4", "ky", "ielts"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/ɪnˈsentɪv/", us: "/ɪnˈsentɪv/" },
        senses: [
          {
            id: uid(),
            pos: "n.",
            translation: "激励；刺激；动机",
            definition: "something that encourages you to work harder or to do something",
            examples: [
              { en: "There is little incentive to save money now.", zh: "现在存钱没什么动力。" },
              { en: "Tax incentives for green energy are expanding.", zh: "针对绿色能源的税收激励正在扩大。" },
            ],
            usage: "可数名词，常见 incentive to do sth、incentive for sb；经济与政策语境的常用词。",
            patterns: ["an incentive to do sth", "financial/tax incentives"],
            synonyms: ["motivation", "stimulus", "encouragement"],
            antonyms: ["deterrent", "disincentive"],
            collocations: ["provide an incentive 提供激励", "incentive scheme 激励方案"],
            notes: "政策类阅读里常与 subsidy（补贴）同框出现。",
          },
        ],
        frequency: { value: 5, max: 5 },
        pitfall: "介词陷阱：是 incentive to do，不是 incentive doing；反义表达 disincentive 更书面。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["incentive", "外部给的激励（钱、政策）", "tax incentives"],
            ["motivation", "内在的动机、干劲", "lack motivation"],
            ["stimulus", "刺激因素，偏经济学", "economic stimulus"],
          ],
        },
        family: [
          { key: "incentivize", value: "v. 以奖励驱动；激励" },
          { key: "disincentive", value: "n. 抑制因素；反激励" },
        ],
        transforms: [{ form: "incentives", pos: "n.", note: "复数" }],
        collocations: ["create incentives 创造激励", "incentive mechanism 激励机制"],
        contexts: ["经济", "政策", "雅思写作"],
        associations: ["in + cent（唱，canere）：用「诱人的曲调」把人引过去 → 激励"],
        examplesExtra: [
          { en: "Bonuses give employees a real incentive to improve.", zh: "奖金给了员工实实在在的改进动力。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**写作替换**：想表达「政策鼓励某事」，用 provide incentives for 比 encourage 更学术。",
        etymology: "拉丁语 incentivus（定调的、激发的），in-（向内）+ canere（唱），原义「奏起曲调」。",
      },
    }),
    makeEntry({
      headword: "thrive",
      tags: ["cet4", "ielts"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/θraɪv/", us: "/θraɪv/" },
        senses: [
          {
            id: uid(),
            pos: "v.",
            translation: "茁壮成长；（企业等）兴旺，繁荣",
            definition: "to grow, develop or be successful, especially in a good environment",
            examples: [
              { en: "Few plants thrive in the desert.", zh: "沙漠里能长得好的植物不多。" },
              { en: "Businesses thrive in a stable market.", zh: "企业在稳定的市场里会蓬勃发展。" },
            ],
            usage: "不及物动词，不能接宾语；主语常为企业、植物、孩子、社区。",
            patterns: ["thrive on sth", "a thriving business"],
            synonyms: ["flourish", "prosper", "boom"],
            antonyms: ["decline", "wither"],
            collocations: ["thrive on challenges 越战越勇", "a thriving market 繁荣的市场"],
            notes: "与 flourish 的语感差别见上方辨析表。",
          },
        ],
        frequency: { value: 4, max: 5 },
        pitfall: "别再写 thrive to do：它是不及物动词。名词表达用 prosperity，别混用。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["thrive", "环境合适就长得好", "plants thrive in shade"],
            ["flourish", "繁荣且显眼地好", "the arts flourished"],
            ["prosper", "经济上越来越成功", "the family prospered"],
          ],
        },
        family: [{ key: "thriving", value: "adj. 旺盛的；兴旺的" }],
        transforms: [
          { form: "thrives", pos: "v.", note: "第三人称单数" },
          { form: "thrived", pos: "v.", note: "过去式 / 过去分词" },
          { form: "thriving", pos: "v.", note: "现在分词" },
        ],
        collocations: ["thrive on competition 在竞争中如鱼得水", "a thriving community 兴旺的社区"],
        contexts: ["经济", "生物", "写作"],
        associations: ["thrive 里藏着 rive（河）：河水充足，两岸草木繁盛 → 茁壮成长"],
        examplesExtra: [
          { en: "Children thrive when they feel safe.", zh: "孩子感到安全时，成长得最好。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**搭配提示**：thrive on 表示「在……中如鱼得水」，中性偏褒，如 thrive on pressure（在压力下反而出彩）。",
        etymology: "源自古诺斯语 thrifask（抓住、受益），随商业语境演变为「繁荣、兴旺」。",
      },
    }),
    makeEntry({
      headword: "transparent",
      tags: ["ky", "ielts"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/trænsˈpærənt/", us: "/trænsˈpærənt/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "透明的；公开透明的；（表达）一目了然的",
            definition: "clear enough to see through; open and honest, with nothing hidden",
            examples: [
              { en: "The process should be transparent to everyone.", zh: "流程应当对所有人公开。" },
              { en: "The company adopted a transparent pricing policy.", zh: "公司采用了透明的定价政策。" },
            ],
            usage: "物理「透明」与治理「公开透明」两义都常用；名词 transparency。",
            patterns: ["be transparent about sth", "a transparent process"],
            synonyms: ["clear", "open", "see-through"],
            antonyms: ["opaque", "secretive"],
            collocations: ["transparent about sth 对某事公开", "fully transparent 完全透明"],
            notes: "写作常见并置：transparent and accountable。",
          },
        ],
        frequency: { value: 4, max: 5 },
        pitfall: "拼写易错：中间是 trans-par-ent（有那个 a）；名词是 transparency，没有 transparentness 这种写法。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["transparent", "没藏着东西，看得穿", "transparent rules"],
            ["clear", "清楚明白，无歧义", "clear instructions"],
            ["explicit", "明确写出来、不靠暗示", "explicit permission"],
          ],
        },
        family: [
          { key: "transparency", value: "n. 透明；透明度" },
          { key: "transparently", value: "adv. 透明地；公开地" },
          { key: "opaque", value: "adj. 不透明的；难懂的（反义）" },
        ],
        transforms: [
          { form: "more transparent", pos: "adj.", note: "比较级" },
          { form: "most transparent", pos: "adj.", note: "最高级" },
        ],
        collocations: ["transparent pricing 透明定价", "a transparent process 公开的流程"],
        contexts: ["治理", "商业", "写作"],
        associations: ["trans（穿过）+ parent（显现）：光穿过去，什么都看得见 → 透明的"],
        examplesExtra: [
          { en: "The company promised to be transparent about the recall.", zh: "公司承诺对召回一事保持公开。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**语境拓展**：写作里 transparent 常与 accountability（问责）连用，构成公共治理话题的词群。",
        etymology: "中世纪拉丁语 transparere，trans-（穿过）+ parere（显现）。",
      },
    }),
    makeEntry({
      headword: "legitimate",
      tags: ["ky", "toefl"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/lɪˈdʒɪtɪmət/", us: "/lɪˈdʒɪtɪmət/" },
        senses: [
          {
            id: uid(),
            pos: "adj.",
            translation: "合法的；正当合理的",
            definition: "allowed by law; fair and reasonable",
            examples: [
              { en: "That is a legitimate question to ask.", zh: "这个问题问得正当。" },
              { en: "Parents have a legitimate interest in school safety.", zh: "家长对校园安全有正当的关切。" },
            ],
            usage: "两义并行：法律上合法（≈ lawful）与情理上站得住（≈ reasonable）；名词 legitimacy。",
            patterns: ["a legitimate concern", "perfectly legitimate"],
            synonyms: ["lawful", "valid", "justified"],
            antonyms: ["illegitimate", "unlawful"],
            collocations: ["a legitimate concern 正当关切", "legitimate means 合法手段"],
            notes: "illegitimate 在阅读里还有「私生的」一义，注意语境。",
          },
        ],
        frequency: { value: 4, max: 5 },
        pitfall: "发音易错：重音在第二音节 /lɪˈdʒɪtɪmət/，词尾弱读成 /mət/，别一个音节一个音节地用力念。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["legitimate", "合法且讲得通", "a legitimate reason"],
            ["legal", "法律允许的", "legal advice"],
            ["lawful", "正式书面：不违法的", "a lawful order"],
          ],
        },
        family: [
          { key: "legitimacy", value: "n. 合法性；正当性" },
          { key: "legitimately", value: "adv. 正当地；合理地" },
          { key: "legitimize", value: "v. 使合法化" },
        ],
        transforms: [{ form: "legitimately", pos: "adv.", note: "副词形式" }],
        collocations: ["legitimate expectations 合理预期", "legitimate authority 合法权威"],
        contexts: ["法律", "政治", "论证"],
        associations: ["leg（法律，leg-）+ itimate：站得住法条的事 → 合法的、正当的"],
        examplesExtra: [
          { en: "People have a legitimate right to know how data is used.", zh: "人们有正当权利知道数据被如何使用。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**写作替换**：论证里的「合理的担忧」，写 a legitimate concern 比 a reasonable worry 更正式。",
        etymology: "拉丁语 legitimus（合于法的），lex / legis（法律）+ -imus（最合乎），本义「最合于法度的」。",
      },
    }),
    makeEntry({
      headword: "advocate",
      tags: ["ky", "toefl", "cet4"],
      source: { kind: "manual", label: "示例数据", at: now },
      values: {
        phonetic: { uk: "/ˈædvəkeɪt/", us: "/ˈædvəkeɪt/" },
        senses: [
          {
            id: uid(),
            pos: "v.",
            translation: "提倡；主张；拥护",
            definition: "to publicly support an idea, policy or group of people",
            examples: [
              { en: "Economists advocate cutting the deficit.", zh: "经济学家主张削减赤字。" },
              { en: "She has always advocated for cleaner cities.", zh: "她一直为更清洁的城市发声。" },
            ],
            usage: "后接动名词：advocate doing sth；也可 advocate sth、advocate for sb/sth。",
            patterns: ["advocate doing sth", "advocate for sb/sth"],
            synonyms: ["support", "champion", "promote"],
            antonyms: ["oppose", "discourage"],
            collocations: ["advocate strongly 强烈主张", "advocate for change 推动变革"],
            notes: "不接 to do：对，advocate doing；错，advocate to do。",
          },
          {
            id: uid(),
            pos: "n.",
            translation: "拥护者；倡导者；辩护律师",
            definition: "a person who publicly supports something, or a lawyer who defends a case in court",
            examples: [
              { en: "She is a lifelong advocate of free education.", zh: "她终身为免费教育奔走。" },
              { en: "the advocate for the defence", zh: "辩方律师" },
            ],
            usage: "名词与动词同形，但读音不同：动词收 /keɪt/，名词弱读 /kət/。",
            patterns: ["an advocate of/for sth"],
            synonyms: ["supporter", "proponent", "defender"],
            antonyms: ["opponent"],
            collocations: ["a strong advocate 坚定的倡导者"],
            notes: "the advocate for the defence 是英式说法，美式常用 defense attorney。",
          },
        ],
        frequency: { value: 5, max: 5 },
        pitfall: "两种读音别混：动词 -cate 收 /keɪt/，名词 -cate 弱读 /kət/。听力里靠重音和词尾区分词性。",
        discrimination: {
          columns: ["对比词", "侧重", "示例"],
          rows: [
            ["advocate", "公开主张、推动", "advocate reform"],
            ["argue", "论证；主张，带论据", "argue for/against"],
            ["propose", "提出方案供讨论", "propose a plan"],
          ],
        },
        family: [
          { key: "advocacy", value: "n. 倡导；辩护" },
          { key: "advocate", value: "n. 拥护者（名动同形）" },
        ],
        transforms: [
          { form: "advocates", pos: "v./n.", note: "第三人称单数 / 复数" },
          { form: "advocated", pos: "v.", note: "过去式 / 过去分词" },
          { form: "advocating", pos: "v.", note: "现在分词" },
        ],
        collocations: ["advocate for change 推动变革", "a strong advocate 坚定的倡导者"],
        contexts: ["社会议题", "法律", "辩论"],
        associations: ["ad（向）+ voc（声音，voc-）：替人「发声」的人 → 拥护、倡导"],
        examplesExtra: [
          { en: "Many doctors advocate raising the legal age for tobacco.", zh: "不少医生主张提高烟草的法定购买年龄。", source: "自撰例句" },
        ],
        illustration: sampleIllustration(),
        notes: "**同形提醒**：同一个拼写，动词读 /-keɪt/、名词读 /-kət/；写作中 advocate that… 的说法更正式。",
        etymology: "拉丁语 advocare（召唤来帮助），ad-（向）+ vocare（呼叫），原义「请来为你在法庭发声」。",
      },
    }),
  ];

  return {
    id: uid(),
    name: "示例词库 · 核心 10 词",
    description: "内置示例：10 个词，14 种字段全部用上（音标、释义、考频、辨析、配图）。随便改、随便删，用来熟悉流程最合适。",
    tags: ["示例"],
    createdAt: now,
    updatedAt: now,
    schema,
    entries,
    exportSettings: defaultExportSettings("示例词库 · 核心 10 词"),
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
