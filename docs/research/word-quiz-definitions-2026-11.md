# Word Quiz 一句话释义、难度与共享题库调研

> 日期：2026-11-25
> 状态：产品与工程决策稿。来源事实与设计推断分开标注。
> 范围：Word Quiz B1 的四子型、英英释义写法、四选项与限时规则、AI 准入、公共题库的读写边界。
> 说明：本文所有例句均为自撰示意，不复制词典原文。

## 1. 已锁定的产品口径

1. 用户最终选择三个题型大类：**熟悉度自评、选择题、Cloze**。
2. 「选择题」是用户可见名称，内部沿用 **Word Quiz B1**，合并现有三种选择题并增加「看英文词选英文释义」。
3. Word Quiz B1 固定四个子型：
   - `word2def`：看英文词，选英文释义。
   - `def2word`：看英文释义，选英文词。
   - `zh2word`：看中文释义，选英文词。
   - `word2zh`：看英文词，选中⽂释义。
4. 每题四个选项，限时作答。
5. B2 的原始想法是给句填空；当前产品用 **Cloze** 独立实现与命名，不再把 Cloze 称为 Word Quiz。
6. 旧稿「一句正确句 + 三句 AI 错句」不是 B1 定义，已撤回。

## 2. 词典式一句话释义

### 2.1 来源事实

- 【事实】LDOCE 使用约 2,000 个常用词编写释义，并把最常见义项放在前面，同时把语法、搭配和真实例句组织在同一词条中。适合作为「解释所用的词不要太难」的参考，但不应复制其原文。来源：[LDOCE About](https://www.ldoceonline.com/about.html)。
- 【事实】Oxford 学习者词典按词性组织词条，每个词性至少有一个核心义项，例句用于展示具体义项的实际用法。适合作为「先定词性和唯一义项，再写一句话」的结构参考。来源：[Oxford Guide to the Dictionary](https://premium.oxforddictionaries.com/de/worter/guide-to-the-dictionary)。
- 【事实】COBUILD 的释义传统强调用完整句子和自然英语解释词义。适合作为一句话释义的风格参考。
- 【推断】对 WulonVocab 而言，一句话释义应是「让学习者能区分一个义项」的解释，不是完整词条，也不是把中文逐字翻译成英文。

### 2.2 统一写法

每条释义只解释一个义项，采用自然英语，推荐 6–18 词，最长不超过 24 词。

必须满足：

- 不出现目标词及其派生形、词族拼写，避免词形泄底。
- 不依赖专有名词、个人经历或只有原文语境才成立的信息。
- 只使用该学习阶段常见的解释词汇；不能确定难度时优先改写，而不是堆同义词。
- 不用元语言句式，例如 “This word means...”。
- 名词写「类别 + 用途 / 功能」，动词写「动作 + 对象 + 方式 / 目的」，形容词写「性质 / 状态」，其他词性写语法关系或功能。
- 一句话只保留一个可判定的核心区别，避免把多个义项揉在一起。
- 释义与选项必须能唯一对应；出现两个答案都合理的情况时不出题。

### 2.3 按词性的写法

| 词性 | 一句话结构 | 自撰示意 | 本地准入重点 |
|---|---|---|---|
| 名词 `n.` | “A [类别] used for [用途]” / “A [类别] that [功能]” | “A tool used to measure how heavy something is.” | 类别不能太宽，用途应能区别于最近邻词 |
| 动词 `v.` | “To [动作] [对象] in order to [目的]” / “To [动作] [对象] by [方式]” | “To join separate pieces together so they stay in place.” | 不把目标词当动词原形写进解释，及物性与介词关系清楚 |
| 形容词 `adj.` | “Describing [性质]” / “Having or showing [质量或状态]” | “Describing evidence based on tests or direct experience.” | 说明它描述什么，不用同义形容词循环解释 |
| 副词 `adv.` | “In a [方式]” / “To a [程度或频率]” | “In a way that is likely to change without warning.” | 与对应形容词的区别明确，能独立判断 |
| 介词 `prep.` | “Used to show [空间 / 时间 / 逻辑关系]” | “Used to show the point where something starts.” | 最好附带最小语境，否则容易多解 |
| 连词 `conj.` | “Used to connect [两个分句关系]” | “Used to connect two ideas that happen at the same time.” | 关系必须唯一，不把多个连接功能混在一起 |
| 代词 `pron.` | “Used to refer to [指代对象]” | “Used to refer to a thing already mentioned.” | 只接受语境足够、指代关系明确的题 |
| 限定词 / 冠词 | “Used before [名词类别] to show [限定关系]” | “Used before a singular countable noun to refer to any one of its type.” | 缺少上下文时不出题 |
| 助动词 | “Used with [动词形式] to show [时态 / 语气]” | “Used with a main verb to ask a question.” | 不能与实义动词混淆 |
| 感叹词 | “Used to express [情绪或反应]” | “Used to express surprise when something unexpected happens.” | 只接受自然、常见且不依赖特定文化的解释 |

【推断】介词、限定词、冠词、感叹词等词性高度依赖语境。若 AI 无法给出一个无需额外语境也能唯一成立的释义，应跳过该题，不用「猜语法功能」凑覆盖率。

### 2.4 释义准入口径

- `word2def`：题面只显示词形与音标；选项是四个同词性、同语域的英文释义。
- `def2word`：题面只显示英文释义；选项是四个同词性英文词。隐藏词头题作答前不得朗读。
- `zh2word`：中文释义只取一个义项，不附带目标词的词形、词根或强提示。
- `word2zh`：中文选项应区分清楚，避免「都是某个词的正确翻译但此处不是该义项」的多解。

## 3. 四选项、易混项与难度

### 3.1 来源事实

- 【事实】最佳答案题应聚焦一个问题，并让干扰项合理、同质；增加选项数量本身不等于提高题目质量。来源：[One-best-answer questions in medicine](https://pmc.ncbi.nlm.nih.gov/articles/PMC6788158/)。
- 【事实】三项选项题也能保留测量质量，四或五项仍是常见形式。来源：[Three-option multiple-choice tests](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051253/)。
- 【决策】WulonVocab 固定四选项，以符合用户要求并兼容现有 W/E/I/O 直选键位。

### 3.2 「不超过两个混淆项」的四选项模型

四选项并不等于四个都难。采用固定结构：

- 1 个正确答案。
- 1–2 个真正的易混干扰项，来自近义词、上下位词、形近词、常见搭配混淆或学习者常见错误。
- 其余 1–2 个是明显非同类的对照项，用于保持四选项形态，不计入「易混项个数」。

默认使用 2 个易混项；候选不足时使用 1 个，无法组成四个合格选项就不出题，回退到翻卡或其他可用题型。

每个选项记录 `role: "correct" | "confusable" | "contrast"`。界面不向学习者暴露这个字段，只用于生成、质量统计与社区审核。

### 3.3 难度模型

| 档位 | 易混项 | 默认时限 | 释义与选项特征 |
|---|---:|---:|---|
| 轻松 | 1 | 25 秒 | 对照项区别明显，释义短 |
| 标准 | 2 | 15 秒 | 同一词性与语域，最近邻差异清楚 |
| 挑战 | 2 | 10 秒 | 释义更长或最近邻更接近，选项长度与结构尽量同质 |

- 四个子型分别可配置 10 / 15 / 20 / 25 / 30 秒；默认 `word2def` 30 秒、`def2word` 20 秒、`zh2word` 与 `word2zh` 各 15 秒。旧统一 10 / 25 秒迁移到全部子型，旧默认 15 秒采用新分档默认值，已有子型配置优先。
- 计时从题目完成渲染、可以作答时开始，不把 AI 等待、页面切换和弹窗解释时间算入。
- 页面隐藏时暂停；恢复后继续，不悄悄扣除离开时间。
- 超时按 Again 处理，必须停留并揭示正确答案。
- 选择题答对最高 Good；开启「稳 / 猜」时，猜对记 Hard。
- 难度由易混项数量与时限共同决定，不通过故意写歧义句制造难度。

## 4. AI 生成与本地准入

### 4.1 必要性与降级

- 现有三子型可继续使用词条已有字段生成；`word2def` 通常需要 AI 撰写自然英文释义。
- 即使已有英文释义，真正近义的混淆项仍需要额外生成；离线启发式只能作为兜底，不能冒充高质量易混项。
- AI 未配置、请求失败、校验失败或超时：该题静默跳过，回退到现有选择题或翻卡，不阻塞学习会话。
- 不默认对每个词调用 AI；优先查公共题库，再查本机缓存，最后按需生成当前题与预取下一题。

### 4.2 输入边界

提示词只接收当前词、词性、目标义项、词库难度与候选词表。词条字段与导入内容均声明为数据，其中任何指令都忽略。系统提示保持字节稳定，单次小批生成，输出严格 JSON。

### 4.3 准入清单

以下任一不通过即拒收：

1. 四个子型、词性、义项编号与目标词完整。
2. 四个选项互不重复，正确答案恰好一个。
3. 英英释义不含目标词及派生形。
4. 易混项最多两个，其余明确为对照项。
5. 选项同词性、同语域，句式与长度尽量同质。
6. 释义只解释一个义项，不含专有名词、时效信息或循环释义。
7. AI 对每个易混项给出「与正确项的关键差异」；没有差异就不作为易混项。
8. 公共题与本地题使用同一校验器，版本升级后可重新校验旧缓存。

## 5. 共享题库架构

### 5.1 来源事实与限制

- 【事实】公共 Gist 可以匿名读取；写入需要带 `gist` scope 的令牌。来源：[GitHub Gists REST API](https://docs.github.com/en/rest/gists/gists)。
- 【事实】Gist 可以 fork、评论与版本化，但它围绕所有者组织，不具备仓库式的 Issues、Pull Requests、分支保护和审核流。Gist 适合低摩擦分发，不适合直接承担社区维护的唯一真源。
- 【事实】公共仓库支持 Issues、fork 与 Pull Requests，适合举报、纠错和审核。来源：[Contributing to a project](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project)。
- 【事实】GitHub Device Flow 可用于 CLI 或无浏览器的 OAuth 授权，但仍需一个已注册的 OAuth Application 客户端标识。来源：[Authorizing OAuth apps](https://docs.github.com/en/enterprise-server@3.8/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。

### 5.2 最优决策：仓库维护，Gist 分发

采用双层结构，不引入后端：

1. **公共 GitHub 仓库是维护真源**：题目文件、贡献模板、举报与纠错入口、审核记录都在仓库中。
2. **公共 Gist 是只读分发镜像**：GitHub Actions 在审核合并后生成清单和分片，应用只从公共 Gist 拉取。
3. **应用读取无需令牌**：匿名请求，按需下载单词所在分片，不一次拉全库。
4. **应用写入需用户明确授权**：先生成本地贡献包，由用户确认内容后上传。未注册 OAuth Application 前提供仓库贡献入口，不伪造上传能力。

这保留用户要求的「公共 Gist 可访问、可查已有题、可上传 AI 生成题」，同时避免把未经审核的并发写直接落到同一 Gist。

### 5.3 数据结构与分片

题目至少包含：

```ts
interface SharedQuizQuestion {
  id: string;
  version: number;
  word: string;
  pos: string;
  kind: "word2def" | "def2word" | "zh2word" | "word2zh";
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  clue: string;
  options: Array<{
    text: string;
    correct: boolean;
    role: "correct" | "confusable" | "contrast";
    note?: string;
  }>;
  difficulty: "easy" | "normal" | "hard";
  timeLimit: number;
  attribution: {
    author: string;
    license: "CC0-1.0" | "CC-BY-4.0";
  };
  status: "approved";
  updatedAt: string;
}
```

- 正确答案同时由 `correct: true` 与 `role: "correct"` 表达，不依赖选项顺序。
- 题目 ID 在内容更新时保持稳定，版本号递增。
- 清单记录 `schemaVersion`、`updatedAt` 与分片列表。
- 按单词哈希分为 64 个分片，应用按需拉取；公共 Gist 单文件与文件数限制足够。
- 应用本地再次校验，不因公共题标记 approved 就跳过检查。
- 本机缓存 24 小时，离线时可继续使用最近一次已下载的题目。

### 5.4 贡献、举报与纠错

- **上传**：显示完整预览，确认后生成标准化 JSON 与贡献说明；用户主动授权 GitHub 后才发送。
- **举报**：本地立即隔离该题；同步恢复时继续屏蔽，除非题目版本发生明确变化。社区举报附题目 ID、版本与原因。
- **纠错**：以原题 ID 创建修改包，保留原版本与修改理由，进入仓库审核，不覆盖其他人的贡献。
- **重复题**：清单允许按 `word + pos + kind + sense` 查重；同一关键词多个义项可并存。
- **隐私**：上传包不包含学习记录、词库内容、设备 ID、API Key 或个人笔记，只包含用户确认发布的题目与署名。

## 6. 实施顺序

1. 先完成四子型、`word2def`、四选项与限时交互，不依赖公共题库。
2. 接入 AI 生成、同词性选项、易混项差异校验与本机缓存。
3. 加公共 Gist 清单与按需分片读取，先做只读。
4. 建仓库贡献模板和贡献包下载；OAuth 应用注册完成后再开应用内上传。
5. 最后接举报、纠错与社区状态回流。

任何阶段失败都不得降低「唯一答案、错题停留、隐藏词头判定后朗读、答对封顶 Good」的学习硬规则。
