# WulonVocab JSON 字段参考（v1）

本文件是 `SKILL.md` 的展开参考：完整的字段类型、规范值形态、容错规则与导入行为。
WulonVocab 导入器非常宽容，但**规范形态**能获得最好的排版效果。

## 顶层文档

```jsonc
{
  "format": "wulonvocab",   // 固定
  "version": 1,
  "wordbook": {             // 可选：词库元信息
    "name": "考研核心词汇",
    "description": "一句话说明",
    "tags": ["考研"],
    "meta": { "language": "en", "level": "CET6", "coverEmoji": "📚" }
  },
  "schema": { "sections": [ /* 可选；省略则自动推断字段 */ ] },
  "entries": [ /* 词条数组，必须 */ ]
}
```

兼容的其它输入（无需转换，直接可导入）：

- 纯词条数组 `[{ headword/word, ...字段 }]`
- 包装对象 `{ "words": [...] }` / `{ "list": [...] }` / `{ "data": [...] }`
- 「单词 → 内容」映射对象 `{ "abandon": { "translation": "..." } }`
- NDJSON（每行一个 JSON 对象）
- CSV / TSV（含 ECDICT 13 列格式与通用表头）

## 词条

```jsonc
{
  "headword": "abandon",   // 必填。别名：word / term / spelling / 单词 / 词
  "tags": ["cet4", "ky"],  // 词条级标签（列表筛选用），字符串或数组
  "status": "new",         // new | learning | mastered（可选）
  "starred": true,         // 可选
  "values": {              // 字段键 → 值
    "phonetic": { "uk": "/əˈbændən/", "us": "/əˈbændən/" },
    "senses": [ /* … */ ]
  }
}
```

> 也支持「平铺」写法：把 `values` 里的键直接放在词条对象上（`{ "headword": "abandon", "senses": [...] }`），导入器会自动归位。

## 各字段类型

### pronunciation 音标

```json
{ "uk": "/əˈbændən/", "us": "/əˈbændən/", "audioUk": "https://…mp3", "audioUs": "https://…mp3" }
```

容错：`"əˈbændən"`（自动补斜杠）、`["英", "美"]`、`{ "bre": "...", "name": "..." }`、`{ "英": "...", "美": "..." }`。

### senses 词性与释义（核心）

数组元素规范形态：

```json
{
  "pos": "v.",
  "translation": "中文释义",
  "definition": "English definition",
  "examples": [{ "en": "…", "zh": "…", "source": "OALD" }],
  "usage": "用法说明",
  "patterns": ["abandon sb/sth"],
  "synonyms": ["desert"],
  "antonyms": ["keep"],
  "collocations": ["abandon hope 放弃希望"],
  "notes": "备注 / 辨析"
}
```

容错与自动处理：

- 字符串形式 `"v. 抛弃；遗弃"` → 自动拆分词性前缀与释义；
- 内联枚举 `"①… ②…" / "1. … 2. …"` → 自动拆成多个义项；
- 按词性分组对象 `{ "v.": [...], "n.": [...] }` → 自动展开并继承词性；
- 平行数组 `{ "definitions": [...], "translations": [...] }` → 按索引配对；
- 中英混排字符串（`"to leave sb 抛弃"`）→ 例句与释义会按脚本自动分离。

### keyvalue 词族 / 键值对

```json
[{ "key": "abandonment", "value": "n. 遗弃；放弃" }]
```

容错：对象映射 `{ "abandonment": "n. 遗弃" }`、字符串 `"abandonment n. 遗弃"`（自动取第一个非空白片段为键）。

### transforms 词性变换

```json
[{ "form": "abandoned", "pos": "v.", "note": "过去式 / 过去分词" }]
```

容错：`"n. abandonment"`（词性前缀）、`"abandonment (n.)"`（尾注词性）、`{ "n": "abandonment" }`（键为词性）、`"past tense: abandoned"`（冒号前记为说明）。

### examples 例句

```json
[{ "en": "English sentence.", "zh": "中文翻译。", "source": "2019 考研" }]
```

容错：纯字符串（自动按中英文边界拆分）、`{ "text": "…", "translation": "…" }`、`["en…", "zh…"]` 二元数组。

### list 列表 / tags 标签

```json
["abandon hope 放弃希望", "abandon ship 弃船"]
```

容错：字符串按换行 / `；` / `;` / `|` 拆分；对象数组取 `text|value|name|word` 等首个可用字段。

### table 表格

```json
{ "columns": ["词", "语气", "例句"], "rows": [["desert", "更强调背弃职责", "…"]] }
```

容错：对象数组（列 = 键的并集）、二维数组（首行为表头）。

### image 图片

```json
[{ "url": "https://…/memory.png", "caption": "图注" }]
```

容错：字符串 URL、Markdown 图片语法 `![](url)`。

### quote 提示块 / text 短文本 / markdown 长文本

字符串。`quote` 在卡片中渲染为带色提示条（用法提醒、易错点）。

### rating 评分

数字 `1–5`，或 `{ "value": 4, "max": 5, "label": "考频" }`。容错：`"★★★"`。

## schema.sections 元素

```json
{
  "key": "senses",
  "label": "词性与释义",
  "type": "senses",
  "icon": "Layers",
  "color": "blue",
  "order": 1,
  "visible": true,
  "builtin": true,
  "description": "可选说明",
  "options": { "groupByPos": true }
}
```

- `key`：数据键，schema 内唯一；entries 的 values 以此对齐。
- `order`：排版顺序（缺省按数组顺序）。
- `visible`：`false` 时仅存储不排版（导出工作室可再覆盖）。
- 类型清单（`type`）：
  `text` `markdown` `list` `tags` `pronunciation` `senses` `examples` `keyvalue` `transforms` `table` `image` `quote` `rating` `divider`

### 常用 options

| 类型 | options |
| --- | --- |
| senses | `groupByPos`(默认 true)、`posStyle`: `badge`/`plain`/`inline`、`showDefinition`、`showTranslation`、`showExamples`、`showUsage`、`showPatterns`、`showSynonyms`、`showAntonyms`、`showCollocations`、`showNotes` |
| examples | `showZh`、`numbering` |
| keyvalue | `keyLabel`、`valueLabel`、`inline` |
| transforms | `showPos`、`showNote` |
| tags | `color`: `blue`/`violet`/`teal`/`amber`/`rose`/`green`/`gray` |
| list | `ordered` |
| text | `prefix`（行内前缀，如「词源」） |
| table | `headerRow`、`zebra` |
| rating | `max`、`label`、`style`: `stars`/`dots` |
| quote | `tone`: `info`/`tip`/`warning` |
| divider | `dividerStyle`: `solid`/`dashed`/`dotted` |

## ECDICT 数据映射（导入 stardict.csv 时自动应用）

| ECDICT 列 | 映射到 |
| --- | --- |
| `phonetic` | `phonetic.uk`（自动补斜杠） |
| `translation`（每行一义，`vt. 放弃；抛弃`） | `senses[].translation`（自动拆词性前缀） |
| `definition`（每行一义） | `senses[].definition`（按索引与 translation 配对） |
| `exchange`（`p:went/d:gone/i:going/3:goes`） | `transforms`（p=过去式 d=过去分词 i=现在分词 3=第三人称单数 r=比较级 t=最高级 s=复数） |
| `tag`（`zk gk cet4`） | `contexts`（自动译：中考/高考/四级…）+ 词条 tags |
| `collins` / `oxford` | 评分字段与「牛津核心」标签 |
| `pos`（`n:46/v:54` 语料占比） | 保留为数据字段，**不是词性** |
| `bnc` / `frq` | 词频数据字段 |

## 导入行为说明

- 同名单词（大小写不敏感）自动合并：数组字段去重拼接，文本取先出现的非空值；
- schema 中未定义的键不会丢失：保留在词条中，编辑器里可「提升为字段」；
- 空的 `null` / `""` / `[]` 会被忽略；
- 文本自动清理零宽字符、HTML 标签、Anki 记号（`{{c1::…}}`、`[sound:…]`）。
