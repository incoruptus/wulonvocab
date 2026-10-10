# 词典源 + ECDICT 内置调研（R4 · 2026-10-10 实测）

> 背景更正：代码中 **zerodict = freedictionaryapi.com**（可用），**freedict = dictionaryapi.dev**（已停更、今日多次 522，不应默认启用）。

## 0. 最优默认组合（零配置 · 国内可用 · ¥0）

1. **内置 ECDICT 精要包**（离线 2.3 万词，下载 2.1MB，查词 <10ms）——可选标准包 5.7 万词（4.1MB）
2. **freedictionaryapi.com**（英文骨架，1.6–3.2s，CORS ✅ 国内直连 ✅，可选 `translations=true` 直取中文；Wiktionary 数据 CC BY-SA 4.0 需署名）
3. **MyMemory**（中文机翻兜底，1.2s，匿名 5k 字符/日，CORS `*`）
4. 缓存 30 天 + 渐进渲染 + 8s 单源超时（已实现）
5. **freedict（dictionaryapi.dev）默认禁用**；youdao 维持默认关闭

进阶（BYO-Key）：Azure Translator（F0 200 万字符/月、单头签名）＞ 火山翻译（CORS ✅）＞ 有道官方 JSONP（已无词典数据）。

## 1. ECDICT 内置可行性（实测数字）

| 文件 | 词条数 | 原始 | gzip |
| --- | --- | --- | --- |
| `ecdict.csv`（基础版） | 770,611 | 62.9MB | 21.7MB |
| `stardict.csv`（完整版） | 3,402,564 | 221.9MB | 69.5MB |

- **词频标注（bnc/frq）上限 ≈ 前 5 万**（两版一致）；完整版增量是无标注长尾。
- 裁剪子集：BNC∪COCA 前 2 万 → 23,081 词条（slim CSV gz **2.1MB**；入库 JSON ~18MB）；前 5 万 → 56,992 词条（gz **4.1MB**；~35MB）。
- 参考：考试核心集（tag∪oxford∪collins）19,358 词条；∪词频 2 万 = 27,861。
- 全量入库不可行（JSON ~460MB+，移动端崩）→ **裁剪内置是必然**。
- PapaParse 解析：2 万包 33ms / 5 万包 73ms（Node；浏览器 2-3×）。
- 查询：现 localdict 二分查找命中 <10ms；瓶颈在首次整表读入（建议 `saveLocalDictionary` 按 5k 行分块写 + 进度）。
- 可省体积：义项 id 用短 id 替代 UUID → 5 万包 JSON 省 ~3.9MB（需确认编辑器仅要求唯一性）。

## 2. 许可

- **ECDICT：MIT**（Copyright (c) 2025 Linwei / skywind3000）。可嵌入再分发；要求保留版权与许可文本。
- 落地：内置包随附 `ECDICT-LICENSE.txt`；关于页署名：`ECDICT © skywind3000 (Linwei) · MIT · github.com/skywind3000/ECDICT`。
- AGENTS 红线（用户词典数据仅存本机）指用户导入物；内置包是我们生成的分发物，可提交「生成脚本 + 产物 + LICENSE」。

## 3. 一键导入 UX

- 设置 → 本地词库：「精要包 2.3 万词」（2.1MB → 解析 33–150ms → 入库 ~18MB）/「标准包 5.7 万词」（4.1MB / ~35MB）；完整版只给指引（51.5MB 不推荐一键，附内存警告）。
- 资源放 `public/dicts/*.csv.gz`，`assetPath()` 引用；`fetch → DecompressionStream('gzip')`（可加 fflate 兜底）→ 复用现有 `parseImportCsv`/ECDICT 映射。
- 三步进度条（下载/解压/写库）；完成即启用 localdict 并置顶。
- Pages 带宽（100GB/月）：2.1MB/人 ≈ 4–5 万次/月；4.1MB ≈ 2.4 万次/月。
- **现成工件**：`%TEMP%\kilo\sub_20000.csv`（5.0MB）与 `sub_50000.csv`（10.0MB，含 BOM+表头，slim 10 列）可直接 gzip。

## 4. 在线源实测矩阵（2026-10-10）

| 服务 | 免费额度 | CORS | 国内直连 | 结论 |
| --- | --- | --- | --- | --- |
| freedictionaryapi.com | 免费无 Key | ✅ | ✅ 1.6–3.2s | 默认英文骨架 |
| MyMemory | 匿名 5k 字符/日 | ✅ `*` | ✅ 1.24s | 中文兜底 |
| dictionaryapi.dev | — | 故障 | ❌ 多次 522；仓库 2023-11 停更 | **默认禁用** |
| Wiktionary REST | 无 Key | ✅（代理实测） | ❌ 直连超时 | 仅代理场景 |
| kaikki.org 离线包 | 免费 | 静态 | ✅ | 英文 JSONL 3.1GB / gz 499MB，仅补充 |
| 百度翻译 | 认证后 200 万字符/月 | ❌ 无 CORS | 可达但浏览器读不到 | 高级项（需代理） |
| 腾讯 TMT | 500 万字符/月 | ❌ | 同上 | 高级项 |
| 火山翻译 | ~200 万字符/月（待核） | ✅ `*` | ✅ | BYO-Key 高级项（签名复杂） |
| 有道智云 | 50 元体验金 | fetch ❌ / JSONP ✅ | ✅ | 2024-04 起无词典数据，仅翻译 |
| Azure Translator | F0 200 万字符/月 | ✅（含订阅 Key 头） | ✅ | BYO-Key 最佳兜底（单头签名） |
| LibreTranslate 公共实例 | — | 6 实例全挂 | — | 仅自建 |

## 5. 来源

ECDICT LICENSE（同仓库）；freedictionaryapi.com；mymemory.translated.net/doc/usagelimits.php；github.com/meetDeveloper/freeDictionaryAPI（停更证据）；fanyi-api.baidu.com/product/11；cloud.tencent.com/document/product/551/35017；volcengine.com/product/machine-translation；ai.youdao.com 文档；platform.caiyunapp.com；kaikki.org；learn.microsoft.com/azure/ai-services/translator。
