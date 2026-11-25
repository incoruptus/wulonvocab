# R3 竞品功能盘点：背单词 / 记忆产品（2026-11-17）

> 盘点范围：Anki（含 addon 生态）、Quizlet、Memrise、Duolingo、墨墨背单词、不背单词、百词斩、SuperMemo、Mochi、RemNote。
> 方法：优先读官方帮助 / 官网 / 官方应用商店描述；官方页面读不到或产品未公开说明的，明确写「未核实」。产品迭代快，具体 UI 以官方当前版本为准。
> 说明：本文只描述功能与交互，不抄词典释义，不引用营销长文。

## 0. 结论先行

- **排序**：真正给用户「列表排序」的主要是 Anki、Mochi、墨墨（按熟知度）；默认几乎都不是字母序。字母序在多数产品里属于「管理视图」，不是学习队列顺序。
- **分组**：趋势从「复制子牌组」转向「保存视图 / 筛选器」。Mochi 的 Views、Anki 的侧栏筛选 + 筛选牌组是代表；RemNote 用优先级分区，墨墨用词书章节。
- **学新词**：Anki、Mochi、Quizlet、RemNote、不背单词都把「新学」与「复习」分开；自评从 2 档（Mochi）到 4 档（Quizlet / Anki）不等。墨墨用「认识 / 模糊 / 忘记 / 熟知」四档，其中「熟知」永久退出复习。
- **目标系统**：分两派——游戏化 streak（Duolingo、墨墨、百词斩、RemNote）与工作量限额（Anki、Mochi；Memrise 正主动弱化 streak）。宽恕机制（freeze / 补签）是 streak 的常见补丁。
- **「不学习」**：语义最成熟的是 Mochi 的 Archive 与 RemNote 的 Paused / Maintaining：前者不排队但仍可 Cram，后者不排队但调度时钟继续 / 不计每日目标。Anki 只有卡片级 Suspend。
- **加词入口**：Mochi、Quizlet 最收敛；Anki、RemNote 多入口但分区清楚；Duolingo 为 0。WulonVocab 的「入口太杂」不是孤例，可用「一个主入口 + 上下文入口」解决。

## 1. 逐产品盘点

### 1.1 Anki（含 addon 生态）

**排序**
- 浏览器（Browser）表格的列可配置，点列头排序、再点反向；可排序列包括 Sort Field、Due、Interval、Ease、Lapses、Reviews、Created、Card Modified、Note Modified 等，Question / Answer 列不可排。默认按 Sort Field 升序（界面默认，手册未明写）。[A1]
- 新卡「收集顺序」：Deck、Deck then random notes、Ascending position、Descending position、Random notes、Random cards；「新卡排序」：Card type then order gathered、Order gathered、Card type then random、Random note then card type、Random。默认收集 Deck，排序 Card type then order gathered。[A2]
- 复习排序：Due date then random（默认）、Due date then deck、Deck then due date、Ascending / Descending intervals、Ascending / Descending ease、Relative overdueness；开 FSRS 后相对逾期改为 Ascending retrievability。[A2]
- 筛选牌组另有：Oldest seen first、Random、Increasing / Decreasing intervals、Most lapses、Order added、Order due、Latest added first、Relative overdueness。[A3]
- 原生没有「按词频」排序；可用自定义字段 + 浏览器列排序，或 addon 扩展列。[A1][A5]

**分组 / 分区**
- 左侧栏是「筛选树」：Deck、Tags（支持 `父::子` 层级）、Note Types、New / Learning / Review 等状态；Ctrl 追加 AND、Shift 追加 OR、Alt 取反；可保存当前搜索并置顶。[A1]
- 标签可在侧栏拖拽改父子关系；筛选结果不是折叠分区，而是「当前表格」。[A1]
- 用 Custom Study / Filtered Deck 可把「某标签 / 某状态 / 某搜索」变成临时子牌组：Study by card state or tag、Preview new cards、Review ahead、Review forgotten cards、Increase today's limits。[A3]
- 没有内置「首字母 / 词性」分区；需用标签、自定义字段或保存搜索模拟。[A1]

**学习模式**
- 明确区分 New / Learning / Review；牌组选项分别控制 New cards/day、Maximum reviews/day、学习步骤、毕业间隔、失误重学步骤。[A2]
- 自评四键：Again / Hard / Good / Easy；也支持只用 Again / Good 两键。按钮上显示各选项的下次间隔。[A4]
- 自由浏览：Browser 用于检索 / 编辑，不进入调度；筛选牌组关闭「Reschedule cards based on my answers」即为预览 / cram，不改原调度；「Preview new cards」也不会把新卡转成复习卡。[A3]

**目标系统**
- 每日 New cards/day 与 Maximum reviews/day 上限；可按 Preset、This deck、Today only 设置；Limits Start From Top 可让父牌组限制覆盖子牌组。[A2]
- Easy Days 可在一周中指定「Reduced / Minimum」工作日，降低当天负载；没有「休息日」开关，也没有 streak / 目标环。[A2]
- 没有连续打卡、补签、宽恕机制；进度以「今日新卡 / 待复习」计数呈现。[A4]

**牌组级「暂停 / 不学习 / 归档」**
- 官方手册未见牌组级暂停开关。可用的替代是：Suspend（卡片 / 笔记级，隐藏到手动取消）、Bury（隐藏到次日）、把 New/day 与 Maximum reviews/day 设为 0、用筛选牌组排除。[A4][A3]
- Suspend 语义是「无限期不复习，但保留卡片与历史」；Bury 是「次日自动回来」。筛选牌组不能拉入 suspended / buried 卡。[A4][A3]

**加词 / 导入入口**
- 主入口：Add（单条 / 批量笔记）、File > Import、AnkiWeb Shared Decks；浏览器内也有 Add Notes。另有复制粘贴、addon、模板等辅助入口。[A1][A6][A7]
- 入口多，但基本围绕「Add」与「Import」两条主轴；本轮未逐页核读 Import 文档，导入格式细节未核实。[A1]

**Addon 生态**
- 社区 addon 可补足原生排序 / 统计，例如 Advanced Browser 增加可排序列（难度、正确率、复习次数等）；本轮 addon 详情页需 JS，具体列未能核读。[A5]
- addon 生态还覆盖复习热力图、负载均衡、图片遮挡等方向；本轮未逐项核读，故不展开具体功能。[A5]

### 1.2 Quizlet

**排序**
- 单词卡模式默认按原始顺序；可开 Shuffle 随机；可开「分类」把卡分到 Still learning / Know 两组；默认先显示定义，可在 Answer with 里改为先显示词语。[Q1]
- 开 Spaced repetition 后，学习方式可选 Browse cards、Basic sorting、Spaced repetition；可设 New cards per day；未复习过的卡标记 New。[Q2]
- 官方帮助未列出字母序 / 难度 / 添加时间 / 词频排序；本轮也未核实到「按到期时间」排序。[Q1][Q2]

**分组 / 分区**
- 组内分组主要是：星标（Star）筛选、Still learning / Know 两堆；没有标签、首字母、词性分区。[Q1]
- 组内没有标签 / 首字母 / 词性分区；学习集层面是否有文件夹 / 班级分层，本轮未核实。[Q1]

**学习模式**
- 模式包括 Flashcards、Learn、Test、Match 等（官方模式总览）；Learn 是自适应练习，带 Answer Streak（连续答对计数）。[Q4][Q3]
- 间隔重复（Spaced repetition）是独立学习方式，目前仅网页版：翻卡后四档自评 Repeat / Hard / Okay / Easy；Repeat 几分钟内回来，Hard 很快回来，Okay 约一天，Easy 四天以上；可设 New cards/day。[Q2]
- 完成当日复习后，仍可回到普通 Flashcards 继续浏览；Browse cards 不写调度。[Q2]

**目标系统**
- 没有每日目标 / 连续天数体系（官方帮助未见）。Spaced repetition 只有 New cards/day 和「有待复习时 10:00 本地提醒」。[Q2]
- Answer Streak 是 Learn 模式内的「连续答对」：连续答对 5 题开始计数，切换题型会归零；不是每日 streak，也没有 freeze / 补签 / 休息日。[Q3]

**牌组级「暂停 / 不学习 / 归档」**
- Spaced repetition 可在 Options > Study method 切换走，等于暂停该学习集的 SRS；学习集本身仍在，仍可用 Flashcards / Basic sorting。[Q2]
- 没有「归档学习集 / 暂停整个学习集」的官方开关；本轮未核实到。[Q2]

**加词 / 导入入口**
- 创建入口集中在 Create：手动建学习集、Import 导入内容；官方创建页明确提示可用「导入你的内容」节省时间。AI 建卡入口本轮未逐条核读。[Q4]
- 入口数量少，主路径清楚；具体导入格式（Word / Excel / 文本等）本轮未逐条核读。[Q4]

### 1.3 Memrise

**排序**
- 官方帮助未提供词表排序（字母 / 难度 / 添加时间 / 随机）；学习顺序由课程 / 学习引擎决定。[M1]
- Learning Settings 可调：每节 Learn 词数、每节 Review 词数、每节 Speed review 词数；可开关 tapping tests、优先拼写；同一时间每种语言只有一个 Active Wordlist。[M1]

**分组 / 分区**
- 以 Wordlists（主题词表）组织：Greetings & Foundations、Travelling & Living Abroad 等；同一时间只有一个 Active Wordlist，切换后进度保留。[M1]
- My Words 页面集中看词；词状态可标 Known / Difficult；没有标签、首字母、词性分区。[M1]

**学习模式**
- Lessons 是混合活动流：Learn、Review、Sentence Builder、Pronunciation、Videos、Conversations 等；Learn 与 Review 是不同活动。[M1]
- 词的「Known」会停止该词出现在 Learn / Review；「Difficult」会把已学词优先拉出来练。没有四键闪卡自评；以选择 / 拼写 / 听说等题型为主。[M1]
- 官方 FAQ 给出复习间隔：4 小时 → 12 小时 → 24 小时 → 6 天 → 12 天 → 48 天 → 96 天 → 6 个月；答错回到 4 小时。[M1]

**目标系统**
- 官方 FAQ 把 My Activities 定位为「不靠 streak / points 施压」的进度面板：统计 words learned / reviewed、videos watched、conversations completed 等。[M1]
- 明确说「目前没有正式的目标设置工具（yet）」；旧版每日目标 / streak 是否仍保留，未核实。[M1]

**牌组级「暂停 / 不学习 / 归档」**
- 词级 Known 可让单个词退出 Learn / Review；Difficult 可优先练。没有词表级暂停 / 归档的官方说明；切换 Active Wordlist 只是换当前来源，不是暂停调度。[M1]

**加词 / 导入入口**
- PRO 的「Words Added by Me」个人词表可从 Videos 中手动加 / 删词；Word Info 可改词状态。官方 FAQ 未列通用 CSV / 文件导入，未核实。[M1]

### 1.4 Duolingo

**排序**
- 无。课程是固定学习路径，不能对单元 / 词做字母、难度、到期等排序。[D3]

**分组 / 分区**
- Section → Unit → Lesson 三级路径；点单元标签可看当前 Section、已完成 Section 和后续 Section；没有标签 / 词性 / 首字母分区。[D3]

**学习模式**
- 以学习路径 + 个性化练习为主；可回到已完成 Section / Unit 复习旧内容，也可在路径中继续学新内容。[D3]
- 没有闪卡自评（知道 / 不知道、认识 / 模糊 / 不认识）；以选择、听写、口语等题型驱动。[D3]
- 没有「自由浏览词库」；复习入口是课程 Section / Unit，不是词表。[D3]

**目标系统**
- 连胜（Streak）= 连续学习天数；每天至少完成 1 节课（lesson）/ 1 个练习即可延续。[D1]
- Streak Freeze 可「暂停」连胜一天，最多装备 2 个；可用宝石补充；官方博文明确这是给学习者「slack」的宽恕机制。[D2]
- 没有休息日开关；每日目标在应用内存在，但本轮官方帮助只核到连胜条目，具体档位未核实。[D1]

**牌组级「暂停 / 不学习 / 归档」**
- 没有牌组概念；Streak Freeze 只保护连胜，不暂停课程 / 单词复习；也没有单元级暂停。[D2]

**加词 / 导入入口**
- 0。内容由课程固定，用户不能自建词库 / 牌组；本轮未核实到自建词表入口。[D3]

### 1.5 墨墨背单词

**排序**
- 「已选」单词列表可按「熟知度」排序，排序标签在最右侧；「未选」列表按章节组织，章节可收起 / 展开，长按章节标题可在章节内顺选 / 随机选词。[C3]
- 学习队列：默认先复习、再新学；复习顺序按遗忘程度从高到低；新学顺序按你选词时的「顺序 / 随机」。[C1]
- 未核实到字母 A→Z / Z→A、按添加时间、按词频等用户可选排序。[C3]

**分组 / 分区**
- 以「单词书 + 章节」分区：未选列表按章节折叠；已选列表是待学池；云词本支持用 `#章节名` 自定义章节。[C3][C6]
- 另有「释义 / 助记 / 例句」内容标签筛选：在内容列表右上角筛选，选中标签显示绿色；这是学习内容筛选，不是单词分组。[C7]
- 没有标签 / 首字母 / 词性分组；「熟知度」是排序维度，不是分区维度。[C3]

**学习模式**
- 每日学习量 = 当日复习量 + 当日新学量；默认先复习后新学，不把「新学」做成独立模式。[C1]
- 四档反馈：认识（当天不再出现，间隔逐步拉长）、模糊（当天至少再出现 1 次，短期安排复习）、忘记（当天至少出现 2 次）、熟知（永久不再安排复习）。[C2]
- 支持英中 / 中英模式，中英模式可拼写；选词页右上角可切换记忆模式。[C3]

**目标系统**
- 可调「每日学习量」总数；官方明确不设定固定「每日新学量」：当天复习多就少学新词，复习少就多学新词，避免复习堆积。[C1][C4]
- 签到 / 连续签到；补签卡只在「历史最大连续天数 > 当前连续天数」时显示，用于把历史最大连签与最近学习段衔接。[C5]
- 没有休息日 / freeze；补签是事后修复，不是预先暂停。[C5]

**牌组级「暂停 / 不学习 / 归档」**
- 词级「熟知」= 该词不再安排复习；没有词书 / 牌组级暂停的官方说明；换单词书后的进度保留规则未核实，它不是「不学习」开关。[C2]
- 官方单词机文档列有长按设置「熟知 / 收藏 / 不想背」；App 内是否同款入口未核实。[C8]

**加词 / 导入入口**
- 选词（官方词书、搜索、批量勾选、章节顺选 / 随机）、云词本（手动 / 批量、官网同步、分享口令）。[C3][C6]
- 入口较多，但「选词」是主入口；云词本承担自定义词库；本轮未核实 Excel / CSV 文件导入。[C6]

### 1.6 不背单词

**排序**
- 官方商店页未列词表排序；学习流按词书 / 记忆算法组织；未核实到字母、乱序、添加时间、词频等用户可选排序。[B1]
- 生词本 / 收藏支持「分门别类」管理（官方更新日志提到分类收藏），但不是学习队列排序。[B1]

**分组 / 分区**
- 以词书 + 单元组织；生词本 / 收藏做二次归类；没有标签、首字母、词性分区（官方页未列，未核实）。[B1]

**学习模式**
- 官方描述为「学习计划 + 智能复习」；应用内通常分 Learn / Review 两条流（公开教程，非官方商店页明列）。[B1][B3]
- 有拼写测试；每组学习单词量可选 10 / 15 / 20（第三方教程；官方未核到档位说明）。[B1][B3]
- 未核实到四键自评 / 知道-不知道闪卡；以词卡学习 + 拼写 / 选择题为主。[B1]

**目标系统**
- 可设每日新词量、每组词量（第三方教程；官方商店页未列）。[B3]
- 签到送酷币、组队打卡（官方商店页）；没有 freeze / 休息日 / 补签的官方说明，未核实。[B1]

**牌组级「暂停 / 不学习 / 归档」**
- 官方未列词书级暂停 / 归档；公开教程称可在词书编辑中取消勾选单元或单词，从而停止进入新词池（非官方）。[B3]
- 可重置学习记录；这是清空进度，不是暂停。[B3]

**加词 / 导入入口**
- 主入口是词书库 + 生词本 / 收藏；自定义词库 / 文件导入未核实。[B1]

### 1.7 百词斩

**排序**
- 官方「功能介绍」未列词表排序；学习按词书 / 计划顺序推进；未核实到字母、乱序、难度、添加时间等排序。[Z2]

**分组 / 分区**
- 以词书 + 单元 / 学习计划组织；有班级 / 学习小组、已掌握 / 薄弱词统计；没有标签 / 首字母 / 词性分区。[Z2]

**学习模式**
- 提供图片模式、深度模式等学习模式；按艾宾浩斯曲线规划每日复习。[Z1]
- 「斩」是核心交互：对熟悉的词点「斩」，之后不再显示（第三方教程；官方「功能介绍」只写「已掌握单词量」，未单列该按钮）。[Z3][Z2]
- 学完当日计划后可自检；未核实到四键自评 / 知道-不知道闪卡。[Z2]

**目标系统**
- 学习计划可设每日新词数与完成天数；记录进度、已掌握量、遗忘曲线，生成周报 / 月报。[Z2]
- 打卡需完成当日全部学习（含复习）；第三方教程称打卡需分享且不支持补卡，官方页未列细则，未核实。[Z3]
- 没有 freeze / 休息日的官方说明。[Z2]

**牌组级「暂停 / 不学习 / 归档」**
- 官方未列词书 / 计划级暂停；可修改或删除计划、换词书；「斩」是词级移除。[Z3]
- 没有归档语义；删除计划是否保留历史，未核实。[Z3]

**加词 / 导入入口**
- 选词书；官方「功能介绍」明确支持自定义上传词库；计划修改入口可调每日词数 / 天数。[Z2]
- 入口包括词书、计划、斩词；没有统一「导入」中心。[Z2]

### 1.8 SuperMemo

**排序**
- 学习队列（Outstanding）按优先级（priority）排序，官方定义为「按优先级排序的知识序列」；没有字母 / 添加时间 / 词频等常规排序。[S1]
- 队列可手动 Sort（如按知识树等），但帮助站被 Cloudflare 拦截，本轮未核读具体选项；默认按优先级。[S1]

**分组 / 分区**
- 以知识树（Knowledge tree）组织，显示在 Contents 窗口：Concept、Folder、Topic、Item 分支；摘录 / 挖空生成的卡片自动成为原卡的下级。[S4]
- 有概念组（concept group）做跨来源链接；不是标签 / 首字母分区，而是树形大纲。[S4]

**学习模式**
- Learn（新内容）与 Review（到期内容）是不同队列；渐进阅读把 Topic 摘录为 Extract，再挖空成 Item，进入间隔重复。[S5]
- 评分采用分级制（具体档位未核实）；核心不是二元「知道 / 不知道」，而是优先级 + 遗忘指数 + 评分共同调度。[S1][S5]
- 可在 Contents 中自由浏览知识树；学习队列仍是算法驱动。[S4]

**目标系统**
- 官方文档未见每日目标 / streak / 目标环；工作量由优先级、Postpone、Mercy / Spread、自动延迟等管理。[S2][S3]
- Mercy 可把到期内容分散到未来，或提前学习（假期 / 考试前）；Postpone 按优先级与工作量重排，尽量少损害高优先级材料的保留率。[S2][S3]
- 没有休息日开关；用 Postpone / Mercy 替代。[S2][S3]

**牌组级「暂停 / 不学习 / 归档」**
- 没有牌组概念；Postpone / Spread 可临时降低某批材料的压力；Forget / Dismiss 可把材料移出学习队列（具体语义本轮未逐条核读）。[S2][S3]
- 知识树中的分支可整体处理，但「分支级暂停」未核实。[S4]

**加词 / 导入入口**
- Add topic / item、导入 Web / PDF / HTML、渐进阅读、XML 等；入口多且分散，没有单一「导入」中心。[S5]
- 学习曲线陡，入口组织本身就是产品门槛的一部分。[S5]

### 1.9 Mochi

**排序**
- 牌组「Views」支持保存筛选 + 排序：按标题字母、最新添加、最近复习、随机；默认跟随牌组当前排序；New cards 页右上角有 Sort 按钮。[O3][O2]
- 未核实到按难度 / 留存率直接排序；留存率可作为筛选条件（≤80% 等）。[O3]

**分组 / 分区**
- 支持标签（tags）、Pinned、Due status、New、Retention rate、搜索、子牌组；保存为 Views，显示在牌组顶部（Filters / Search 旁）的 chips。[O3]
- View 是「保存的镜头」，不复制卡片、不新建牌组；同一张卡可出现在多个 View。[O3]

**学习模式**
- 两阶段：New cards（Remembered / Forgot）→ Review（Forgot / Remembered）；Remembered 才进入复习调度，Forgot 先跳过 / 稍后再看；复习中忘记进入 re-review，连续忘记才重置。[O1]
- 任意 View 可点 Cram，作为临时练习池，不影响正常调度。[O5]
- 可自由浏览牌组 / View；Cram 即「随心学」。[O5]

**目标系统**
- 可设「Limit new cards per day」；有 Due today 队列；官方文档未见每日目标环 / streak / freeze / 休息日，未核实。[O2]
- 进度以 New / Due 数量呈现。[O2]

**牌组级「暂停 / 不学习 / 归档」**
- Archive card / Archive deck：卡片或整个牌组（含子牌组）退出 New / Due，但保留内容、历史、标签、链接、附件；仍可 Cram / 查看；可随时取消归档。[O4]
- 这是本轮最接近「词库不学习」的语义：不删除、不排队、可逆、仍可自由浏览。[O4]
- 单卡也可 Archive；归档比删除更适合「暂时不背但想留作参考」。[O4]

**加词 / 导入入口**
- New card、模板、Import、牌组分享；主入口是 New Card + Import，比较收敛。[O2][O6]
- 导入的卡默认是 New；具体支持格式（CSV / Anki / Markdown 等）本轮未逐条核读。[O2]

### 1.10 RemNote（可选）

**排序**
- 不支持给全部闪卡强制顺序；官方解释是间隔重复必须按到期时间出卡。Pro 用户可对某个文档做一次性「Practice all flashcards in order」，用于刚建完卡或复习他人文档。[R4][R5]
- 没有字母 / 难度 / 添加时间排序；队列按 SRS 调度。[R4]

**分组 / 分区**
- 以文档 / 文件夹层级组织；标签、属性（properties）可做横切分类；Flashcard Home 按学习优先级把文档分组：Currently Studying、Maintaining、Paused 等。[R2]
- 分区是「文档优先级区块」，不是首字母折叠；标签可用于筛选，但队列的主分区是优先级。[R2]

**学习模式**
- 区分 Learn New（新卡）与 Due Reviews（到期复习）；自评按钮至少含 Forgot（官方明确 Forgot 不计入目标），完整档位未逐条核读。[R1]
- 有 Guided Learn、特定文档 / 特定卡练习；可自由进入文档练习，但常规队列仍按调度。[R5]
- 新卡与复习在 Flashcard Home 分块展示，各自有进度与按钮。[R1]

**目标系统**
- 双层目标：streak goal（默认 10 卡/天，保证习惯）+ daily learning goal（当天总卡数）。[R1]
- 每日目标计算方式：Spread over the week（把一周到期量均摊）、Review all due cards each day、Set a daily limit（30 / 60 / 90 / 120 / 自定义）。[R1]
- 进度条 / 侧栏目标卡 / Stats 热力图；Streak Freeze 每 6 天获得 1 个，最多存 2 个，漏签自动使用；还有 1.5 倍递增的 stretch goal。[R1]
- 官方明确「Forgot 不计入目标」，因为目标算的是「今天答对的卡」；答对后重新计数。[R1]

**牌组级「暂停 / 不学习 / 归档」**
- 文档优先级五档：Exam、Currently Studying、Maintaining、Paused、No Priority。[R2]
- Paused：所有卡永不进入队列（除非你主动练该文档），但到期时钟继续走，取消暂停后能准确估算记忆状态。[R2]
- Maintaining：不计入每日目标，但到期后仍会在「Currently Studying 做完之后」出现；适合「还想记得、但暂不优先」。[R2]
- 可禁用单卡 / 某条 bullet 的后代卡；没有「全局暂停调度器」——官方专门解释不提供，因为会让调度模型失真。[R3]

**加词 / 导入入口**
- 手动建卡、AI 生成、Anki 导入、文本导入、笔记导入、PDF / YouTube Reader、表格生成等；入口很多，按场景分散。[R1][R2]

## 2. 六维度对照表

> 单元格为压缩结论；「未核实」表示本轮未从官方文档确认，不代表一定没有。

| 产品 | 1. 词库 / 牌组内排序 | 2. 分组 / 分区与 UI | 3. 学新词 / 复习 / 自评 / 自由浏览 | 4. 目标 / streak / 宽恕 / 休息日 | 5. 牌组级暂停 / 不学 / 归档 | 6. 加词 / 导入入口 |
|---|---|---|---|---|---|---|
| **Anki** | 浏览器多列排序（Sort Field / Due / Interval / Ease / Lapses / Created 等），默认 Sort Field；新卡 gather / sort、复习 due / ease / interval / random；筛选牌组多种 order | 侧栏筛选树：牌组、层级标签、笔记类型、状态；AND / OR / 取反；保存搜索；筛选牌组做临时子集；无首字母分区 | New / Learning / Review 分开；Again / Hard / Good / Easy（可两键）；Browser 浏览；筛选牌组关 reschedule = 预览 / cram | 新卡 / 日 + 复习上限；Easy Days 降载；无 streak / 目标环 / 休息日 | 无牌组暂停；Suspend 无限期、Bury 次日、限额设 0；筛选牌组排除 suspended | Add、Import、Shared Decks、浏览器 Add Notes；多入口 |
| **Quizlet** | 原始顺序 + Shuffle；Still learning / Know 分堆；SRS 的 New cards/day；无字母 / 难度排序 | 星标筛选 + Know / Still learning；无标签 / 首字母；学习集分层未核实 | Flashcards / Learn / Test / Match；SRS 四档 Repeat / Hard / Okay / Easy；Browse cards；Learn 有 Answer Streak | 无每日目标 / streak；SRS 10:00 提醒；Answer Streak 是答题连击，非每日；无 freeze | SRS 可在 Options > Study method 暂停；无归档 / 整个学习集暂停 | Create、Import；较收敛（AI 入口未核实） |
| **Memrise** | 无用户排序；Learning Settings 调每节 Learn / Review / Speed review 词量、题型开关 | Wordlists 主题词表；单 Active Wordlist；My Words；Known / Difficult 状态；无标签 | Lessons 混合 Learn / Review / 视频 / 会话；Known 停学、Difficult 优先；无四键自评；SRS 4h→…→6 月 | My Activities 明确弱化 streak / points；无正式目标工具；旧每日目标是否保留未核实 | 词级 Known；切换 Wordlist 保留进度；无牌组暂停 / 归档 | Words Added by Me（PRO）从视频加词；无通用文件导入（未核实） |
| **Duolingo** | 无；固定路径 | Section → Unit → Lesson；无标签 | 路径 + 个性化练习；可复习已完成 Section；无闪卡自评 | streak = 每日 ≥1 节课；Freeze 最多 2、宝石补充；每日目标档位未核实；无休息日 | 无牌组；Freeze 只保 streak，不暂停学习 | 0；课程固定，无自建词库 |
| **墨墨背单词** | 已选列表按熟知度；队列复习按遗忘度降序、新词按选词顺序 / 随机；无字母排序 | 词书 + 章节折叠；云词本 `#章节`；已选 / 未选；内容标签筛选（释义 / 助记 / 例句） | 每日复习 + 新学一条流；认识 / 模糊 / 忘记 / 熟知四档；英中 / 中英；无独立新学模式 | 每日学习量总数可调；不固定新学量；签到 + 补签；无休息日 | 词级熟知 = 永久不复习；无牌组级暂停；换词书进度规则未核实 | 选词、云词本、搜索、批量 / 章节选词 |
| **不背单词** | 无公开排序；按词书 / 算法；未核实字母 / 乱序 | 词书 + 单元；生词本分类收藏；无标签 | Learn / Review 两条流（非官方明列）；拼写测试；每组 10 / 15 / 20（第三方）；无四键自评（未核实） | 每日新词 / 每组词量（第三方）；签到 / 酷币 / 组队；无 freeze / 休息日 | 无牌组暂停；可取消勾选词书单元 / 单词（第三方）；重置记录 | 词书库、生词本、收藏；自定义导入未核实 |
| **百词斩** | 无公开排序；按计划 / 词书顺序 | 词书 + 单元 / 计划；班级 / 小组；已掌握 / 薄弱词 | 图片模式 / 深度模式；艾宾浩斯复习；斩（词级移除，非官方说明）；自检 | 每日词数 + 完成天数；打卡（不补卡，第三方）；无 freeze / 休息日 | 无牌组暂停；改 / 删计划；斩单词；无归档 | 选词书、自定义上传词库、计划修改 |
| **SuperMemo** | 队列按 priority；可手动 Sort（未核读）；无字母 / 添加时间排序 | 知识树 Concept / Folder / Topic / Item；概念组；无标签 | Learn / Review / 渐进阅读（Topic→Extract→Item）；分级评分（档位未核实） | 无 streak / 每日目标；priority + Postpone + Mercy / Spread 管负载 | Postpone / Spread 临时降压；Forget / Dismiss 移出学习；无牌组概念 | Add、Web / PDF 导入、渐进阅读；多入口 |
| **Mochi** | Views 排序：字母 / 最新 / 最近复习 / 随机；默认随 deck；New cards 有 Sort | 标签 / Pinned / Due / New / Retention / 搜索；保存 Views 为顶部 chips；子牌组 | Learn（Remembered / Forgot）→ Review（Forgot / Remembered）；Cram 任意 View | Limit new cards/day；无目标环 / streak（未核实） | Archive card / deck：不排队、保留历史、仍可 Cram、可逆 | New card、Import、模板、分享；较收敛 |
| **RemNote** | 无手动顺序；Pro 可一次性按序练某文档；队列 SRS 顺序 | 文档 / 文件夹 + 标签 / 属性；Flashcard Home 按优先级分区（Currently / Maintaining / Paused） | Learn New / Due Reviews；自评（含 Forgot）；Guided Learn；特定文档练习 | streak goal（默认 10）+ daily goal；周分摊 / 全到期 / 限额；Freeze 每 6 天 1 个、最多 2；stretch goal | Paused（不排队、时钟继续）/ Maintaining（不计目标、仍到期）/ 禁用卡片；无全局暂停 | 手动 / AI / Anki / 文本 / 笔记 / PDF / 视频；多入口 |

## 3. 对 WulonVocab 的可借鉴设计

### 3.1 排序：把「管理排序」与「学习队列」分开，提供稳定乱序

**借鉴点**：Anki 的浏览器多列排序 + Mochi 的 View 排序 + 墨墨的「熟知度」排序，合成一个「排序」按钮：第一段选维度（字母 A→Z / Z→A、词库顺序正 / 倒、最近添加 / 编辑、到期时间、熟练度、遗忘次数、乱序），第二段选方向。默认保持「词库顺序」，不擅自改成字母序。乱序用一次性 seed（本次会话固定），避免每次渲染都跳。

**与本地优先约束的冲突点**：FSRS-6 的 due / stability / difficulty 会随复习变化，按这些字段排序会让列表每天甚至每次打开都变；「词库顺序」需要一个持久化的 `order` 字段，导入时按文件顺序赋值，手动拖动后重排。IndexedDB 没有服务端排序，几万词的全量排序应在内存中做一次并缓存；乱序若持久化会破坏「词库顺序」，建议只存 seed、不存结果。

### 3.2 分组：用「保存视图 + 折叠分区」，不要复制词库

**借鉴点**：Mochi 的 Views（标签 / 固定 / 到期 / 新卡 / 留存率，保存为顶部 chips）、Anki 的侧栏筛选 + 筛选牌组、墨墨的章节折叠。WulonVocab 可做「分组依据」下拉：标签、情景标签、首字母、学习状态、词性（若有）；结果用可折叠分区（A / B / C…）或 chips 呈现；同一批词可同时属于多个视图。

**与本地优先约束的冲突点**：视图是「查询结果」，不应复制卡片——复制会带走 FSRS 状态，造成同一词两份调度。标签是多对多，首字母是单值，二者不能共用一套「唯一分组」模型；空分区、未标记词、大小写 / 重音归一化都要规则。首次计算大词库的分组索引可能卡顿，需增量索引或 Web Worker。

### 3.3 学新词：独立「Learn」队列 + 2～3 档自评，毕业后才写 FSRS

**借鉴点**：Mochi 的两阶段（New cards 的 Remembered / Forgot → Review）、墨墨的「认识 / 模糊 / 忘记 / 熟知」、Quizlet 的四档 SRS。WulonVocab 可加「学新词」模式：只取未学词，翻卡后给「认识 / 模糊 / 不认识」三档；「认识」进入下一轮，「模糊 / 不认识」在本轮稍后再出现；全部过一轮后，才把合格词送入 FSRS-6 复习队列。

**与本地优先约束的冲突点**：FSRS-6 的评分接口是四档（Again / Hard / Good / Easy），三档自评不能直接一一映射，否则会扭曲 stability / difficulty。建议「学新词」阶段只记本地学习状态（learning step），不写 FSRS 记忆状态；毕业时按规则映射成 Good / Easy，或把「模糊」映射为 Hard 但明确标注。每日新词计数、当日队列、跨天重置都要在 IndexedDB 里自己维护；多标签页同时学习要加锁，避免同一张卡被两个队列取走。

### 3.4 「不学习」：区分 Paused（暂停）与 Archived（归档）两种语义

**借鉴点**：Mochi 的 Archive deck（不排队、保留历史、仍可 Cram、可逆）+ RemNote 的 Paused / Maintaining（Paused 不排队但时钟继续；Maintaining 不计目标但仍到期）+ Anki 的 Suspend（无限期）。WulonVocab 可给词库一个状态开关：`学习中` / `暂停` / `归档`。

- **暂停**：不进入今日新词 / 复习计划，也不计入学习目标；但 FSRS 的到期时钟继续走，恢复后按实际经过天数计算逾期。
- **归档**：完全隐藏，不计目标、不计「待复习」；恢复时可以选择「按原计划继续」或「重置到期」。

UI 上用徽标 + 数量体现（如「暂停 · 到期 37」），避免用户以为词库消失了。

**与本地优先约束的冲突点**：FSRS-6 依赖「上次复习时间」计算 retrievability；暂停期间时钟继续，恢复时可能一次冒出大量逾期卡，需要产品方决定是否自动分摊（类似 RemNote 的 stale card 慢速 reintroduce）。本地时钟可被修改，逾期计算要防负数 / 时区跳变；「暂停不计目标」会让目标环的分母变化，需要明确目标口径。

### 3.5 加词 / 导入：一个主入口 + 上下文入口，导入幂等

**借鉴点**：Mochi 的 New Card + Import 两条主路径、Quizlet 的 Create 收敛、Anki 的 Add / Import 分工。WulonVocab 可做一个「添加 / 导入」底部抽屉，三个 tab：单个添加、批量粘贴、文件导入；在词库页再放一个上下文按钮「导入到当前词库」，默认带入当前词库。

**与本地优先约束的冲突点**：没有后端，CSV / JSON / TXT 的解析、编码识别、重复检测都要在浏览器完成；大文件要分片 / Web Worker，避免卡死。导入必须幂等：同一文件重复导入不能产生重复词或覆盖 FSRS 状态；更新已有词时，要区分「只更新释义」与「重置学习记录」。没有服务端去重，跨词库的重复词需要本地索引。

## 4. 需产品方拍板的开放问题

1. **「词库顺序」到底是什么？** 是导入时的文件顺序、创建顺序，还是用户可手动拖拽的显式顺序？编辑一个词、重新导入、合并词库时，顺序如何变化？这决定要不要新增 `order` 字段与拖动排序交互。
2. **「不学习」是暂停还是归档？** 只停新词、只停复习，还是两者都停？暂停期间到期积压是否在恢复时一次性释放？是否计入存储统计 / 每日目标？「归档」是否要保留搜索与自由浏览？
3. **「学新词」的自评几档、何时写 FSRS？** 用「知道 / 不知道」两档、三档（认识 / 模糊 / 不认识），还是直接四档？新词阶段的评分是否立即写入 FSRS-6，还是毕业后才写？「模糊」映射到 Hard 还是 Good？
4. **分组是「保存视图」还是「一次性分区」？** 分组结果要不要保存、能否固定到词库顶部？一个词能否同时属于多个分组（标签）？首字母分组按英文 26 字母，还是按中文拼音 / 自定义顺序？空分组是否显示？
5. **目标系统怎么定义？** 按「卡片数」还是「分钟数」？新词与复习是否分开计数？是否要做 streak / freeze / 休息日？「暂停词库」是否从目标分母中剔除？跨时区 / 跨天边界以本地 0 点还是 4 点为准？

## 5. 来源

### Anki
[A1]: https://docs.ankiweb.net/browsing.html
[A2]: https://docs.ankiweb.net/deck-options.html
[A3]: https://docs.ankiweb.net/filtered-decks.html
[A4]: https://docs.ankiweb.net/studying.html
[A5]: https://ankiweb.net/shared/addons/2.1
[A6]: https://ankiweb.net/shared/decks
[A7]: https://docs.ankiweb.net/importing.html

### Quizlet
[Q1]: https://help.quizlet.com/hc/en-us/articles/360030988091-Studying-with-Flashcards
[Q2]: https://help.quizlet.com/hc/en-us/articles/48324742264077-Studying-with-Spaced-Repetition
[Q3]: https://help.quizlet.com/hc/en-us/articles/40011154960653-Studying-with-Answer-Streaks
[Q4]: https://help.quizlet.com/hc/zh-cn/articles/360030841732

### Memrise
[M1]: https://explore.memrise.com/help
[M2]: https://www.memrise.com/

### Duolingo
[D1]: https://www.duolingo.com/help
[D2]: https://blog.duolingo.com/how-duolingo-streak-builds-habit/
[D3]: https://blog.duolingo.com/how-to-review-lessons-on-duolingo/

### 墨墨背单词
[C1]: https://memodocs.maimemo.com/docs/PulqwOB1xi5jV0kb8Y1cPE7ZnKc
[C2]: https://memodocs.maimemo.com/docs/Ok6YwF2X7iJZvvkCunjcmWwLnzb
[C3]: https://memodocs.maimemo.com/docs/GKfswhD6Ei4TdMk0naQcfMBtnJg
[C4]: https://memodocs.maimemo.com/docs/TXhHwrM8Ei5QKjk562mcq8uInef
[C5]: https://memodocs.maimemo.com/docs/WVyFwrbiXiexP7k6N7gcYY0Vnzh
[C6]: https://memodocs.maimemo.com/docs/QKUlwb6qTiLtzvk49BGc1ZVFnqg
[C7]: https://memodocs.maimemo.com/docs/Uv65whPGIih1x2kMNOCc99k4nUe
[C8]: https://memodocs.maimemo.com/docs/support_wordmachine

### 不背单词
[B1]: https://sj.qq.com/topic/79132
[B2]: https://sj.qq.com/appdetail/cn.com.langeasy.LangEasyLexis
[B3]: https://m.php.cn/faq/2680132.html （第三方教程，非官方）

### 百词斩
[Z1]: https://www.baicizhan.com/
[Z2]: https://passport.baicizhan.com/privacy/introductions.html
[Z3]: http://m.anfensi.com/down/224928.html （第三方教程，非官方）

### SuperMemo
[S1]: https://supermemo.guru/wiki/Priority_queue
[S2]: https://supermemo.guru/wiki/Postpone
[S3]: https://supermemo.guru/wiki/Mercy
[S4]: https://supermemo.guru/wiki/Knowledge_tree
[S5]: https://supermemo.guru/wiki/Incremental_reading

### Mochi
[O1]: https://mochi.cards/docs/getting-started/reviewing-cards/
[O2]: https://mochi.cards/docs/reviewing/new-cards/
[O3]: https://mochi.cards/docs/decks/custom-views/
[O4]: https://mochi.cards/docs/reviewing/archiving/
[O5]: https://mochi.cards/docs/reviewing/cramming/
[O6]: https://mochi.cards/docs/import-and-export/importing/

### RemNote
[R1]: https://help.remnote.com/en/articles/7950933-goals-and-streaks
[R2]: https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards
[R3]: https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler
[R4]: https://help.remnote.com/en/articles/8038791-can-i-make-my-cards-appear-in-a-specific-order
[R5]: https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards
