# 数据格式（WulonVocab JSON v1）

权威参考（含全部字段类型、容错规则、ECDICT 映射表）：

- [`skill/wulonvocab-json/references/schema.md`](../skill/wulonvocab-json/references/schema.md)
- 校验脚本：`node skill/wulonvocab-json/scripts/validate.mjs <file.json>`

## 文档骨架

```jsonc
{
  "format": "wulonvocab",
  "version": 1,
  "wordbook": { "name": "考研核心词汇", "description": "…", "tags": ["考研"], "meta": { "coverEmoji": "📚" } },
  "schema": { "sections": [ /* 可选；省略时自动推断字段 */ ] },
  "entries": [
    {
      "headword": "abandon",
      "tags": ["cet4", "ky"],
      "values": {
        "phonetic": { "uk": "/əˈbændən/", "us": "/əˈbændən/" },
        "senses": [
          { "pos": "v.", "translation": "抛弃；遗弃", "definition": "to leave sb…",
            "examples": [{ "en": "…", "zh": "…", "source": "OALD" }],
            "patterns": ["abandon sb/sth"], "synonyms": ["desert"],
            "collocations": ["abandon hope 放弃希望"], "notes": "考研高频" }
        ],
        "family": [{ "key": "abandonment", "value": "n. 遗弃" }],
        "transforms": [{ "form": "abandoned", "pos": "v.", "note": "过去式/过去分词" }],
        "associations": ["a + band（带子）+ on → 丢在路边的带子 → 抛弃"],
        "contexts": ["考研", "新闻"]
      }
    }
  ]
}
```

## 兼容输入（无需转换，直接导入）

| 形态 | 示例 |
| --- | --- |
| 纯词条数组 | `[{ "headword": "…", "senses": […] }]`（字段可平铺在词条对象上） |
| 包装对象 | `{ "words": […] }` / `{ "list": […] }` / `{ "data": […] }` |
| 词典映射对象 | `{ "abandon": { "translation": "…" } }` |
| NDJSON | 每行一个 JSON 对象 |
| CSV / TSV | 通用表头，或 ECDICT 13 列（含/不含表头均可） |

## 字段类型一览

`text` `markdown` `list` `tags` `pronunciation` `senses` `examples` `keyvalue` `transforms`
`table` `image` `quote` `rating` `divider`

`senses` 元素支持字符串简写、词性分组对象、平行数组、内联枚举（①② / 1. 2.）等多种来源形态，
导入时统一收敛；具体规则见 schema.md。

## 导出格式

- 「导出 JSON（含字段表）」= 上述完整文档，可无损再导入；
- 「仅词条数据」= 去掉 `schema` 的版本，导入时自动推断字段；
- 备份（设置页）= `wulonvocab-backup` 文档，包含全部词库 + 设置 + 数据源配置。

## 版本策略

- `version: 1`；导入器对 `format` 缺失/未知的文档保持宽容（尽力解析并给出警告）；
- 破坏性变更时新增 `version` 并在 `store.ts` 的 `migrate` 中处理。
