# WulonVocab 本地现状审计（2026-11-17，主 Agent 亲自读码）

> 目的：为龙的五条真实使用反馈提供「现状事实」底座。所有结论带 file:line 证据；未验证的写「未验证」。
> 仓库：D:\Creation\Caddy Wulon\WulonVocab · main @ 35cc922（比 origin  ahead 1，未 push）· 单测 203/30 全绿（本次实测）。

## 1. 排序系统：确实只有三种，且不持久化

- 词库工作区列表排序选项仅 `order / az / recent`：`src/components/book/EntryList.tsx:156-158`（列表顺序 / 字母序 A→Z / 最近编辑）。
- 排序实现：`EntryList.tsx:76-78`。`az` = `headword.toLowerCase().localeCompare`；`recent` = `updatedAt` 降序；`order` = 数组原序（即 `entry.order` 语义下的列表顺序）。
- **排序与筛选都是组件局部 state**（`EntryList.tsx:47-51` 的 `useState`），刷新即重置，不随同步、不入 store。
- 导出侧另有独立排序：`ExportSettings.sortMode: "list" | "az"`（`src/lib/types.ts:348-349`），在 `useExportDocument.tsx:136-140` 生效。**与列表排序是两套，互不相通。**
- 学习队列顺序：`StudyConfig.queueOrder: "due" | "shuffle"`（`src/lib/study/types.ts:49`）。
  - 复习项：按 `srs.due` 升序取前 `reviewPerDay - daily.reviewed` 个（`queue.ts:72-77`）。
  - **新词项：直接 `book.entries.filter(isNewSrs).slice(0, remaining)`（`queue.ts:80-82`），即永远按列表原序引入，没有任何顺序选项。** 这正是龙「想按字母/乱序/词库序正倒学新词」落空的根因。
  - `shuffle` 只作用于整队 Fisher–Yates（`queue.ts:84-86, 100-107`），不区分新词/复习。
- 结论：缺「字母降序、词库序倒序、按到期/按难度/按添加时间」等维度；缺「新词引入顺序」独立配置；缺排序持久化。

## 2. 分组/分区：只有「单标签筛选」，没有分组呈现

- 现有筛选：状态四档（全部/未学/在学/已掌握）、只看星标、**单个**标签下拉、搜索框（`EntryList.tsx:62-79, 117-169`）。
- 标签有两套且相互独立：`Entry.tags`（词条级，`types.ts:243-244` 注释明确「与情景标签字段相互独立」）与 schema 字段 `contexts`（type `tags`，label「情景标签」，`presets.ts:101` 等；`sections.ts:831` hint「彩色标签组，如情景标签（校园、职场、新闻）」）。
- **没有任何「分组依据 → 分区渲染」的代码**：无 groupBy、无 section header、无折叠分区（grep 无命中）。列表是扁平**全量渲染**（`filtered.map`，`EntryList.tsx:204-228`），外层只是 `overflow-y-auto` 容器，**未虚拟化**（2026-11-17 复核更正：原写「虚拟滚动」有误）。
- 词库级也有 `Wordbook.tags`（`types.ts:270`），但仅用于词库列表，未参与学习分组。
- 结论：分组是「从 0 到 1」的新能力；可复用的原料已存在（Entry.tags、contexts 字段、首字母可由 headword 派生、status、srs 状态）。

## 3. 学习状态：三态由 SRS 派生，即时但粗

- `EntryStatus = "new" | "learning" | "mastered"`（`types.ts:230`）。
- 派生规则（`src/lib/study/engine.ts:85-95`）：
  - `new`：无 srs 或 `state===New` 或 `reps===0`；
  - `mastered`：`state===Review && scheduledDays >= 21`（**硬编码 21 天阈值**）；
  - 其余 `learning`。
- 即时性：状态是**派生值**，`store.applyReview` 写入 srs 后立即重算，所以「学完即时反映」在数据层已成立；粗的是**语义粒度**（21 天一刀切、无连续掌握度、无「认识但不会用」之类区分）。
- 学习中心另有连续量：`medianStability`（学习中卡片 stability 中位数）、`accuracy30`（`metrics.ts:26-27, 99-115`），但**只用于统计展示，未回写到词条状态或列表呈现**。
- 会话形态：`StudyConfig.quizMode: "flip" | "choice"`（`study/types.ts:39`）。**没有「展示内容 + 知道/不知道」的浏览式闪卡自评模式。**
- 但队列层已区分新词/复习：`StudyMode = "mixed" | "review" | "new"`（`queue.ts:54`），开始页有三按钮（`StudySession.tsx:982` 等）。**「学新词」作为队列模式已存在，缺的是新词的交互形态与引入顺序。**

## 4. 目标量化：跨全部词库聚合，无词库级排除

- `computeHubMetrics(books, now)` 遍历**所有** books 累加 due/overdue/newRemaining/newPerDay/heatmap/streak（`metrics.ts:56-87`）。**没有任何「排除某词库」的开关或字段。**
- 每日限额是**每本书独立**：`BookStudy.config.newPerDay / reviewPerDay` + `daily[ymd]`（`study/types.ts:29-50, 79-83`）。学习中心把各书 newPerDay 相加当总目标（`metrics.ts:58`）。
- streak：`heatmap[ymd] > 0` 连续天数，**日界 = 本地 0 点**（`metrics.ts:34-38, 89-97`），无宽恕、无开关。与 ROADMAP 拍板的「4 点日界 + 每周宽恕 + 可开关」尚未实现（与 HANDOVER §5.1 T6 一致）。
- 结论：加「词库不参与学习」需要同时改 `computeHubMetrics`、`computeCapacity`、`buildAdvice` 输入、LearnHub 的 summaries/continueTarget（`LearnHub.tsx:53-84`），并决定该 flag 存 `Wordbook` 主体（随同步 LWW）还是本地偏好。

## 5. 加词/导入入口清单（IA 审计原料）

面向用户的入口（按位置）：
1. 桌面顶导航「导入」→ `/import`（`TopNav.tsx:17`）。
2. 移动端底部 Tab「导入」→ `/import`（`MobileTabBar.tsx:16`，占 5 格之一）。
3. 首页 `/`：「导入词表」CTA（`app/page.tsx:86`）+「AI 生成词库」hero（`app/page.tsx:122-130`）。
4. 词库列表 `/books`：页头「新建词库」「导入 JSON / CSV」（`books/page.tsx:62,65`）+ 空态引导（`:105-109`）。
5. 词库工作区 `/book`：工具栏「导入」两处（桌面/移动，`BookWorkspace.tsx:253,270`）+ 空态「新建词条」（`:424`）+ 列表搜索框回车即建词（`EntryList.tsx:99-101`）+ 行内新建/复制。
6. `/import` 页内四块：粘贴单词列表（TextImportPanel）、文档/图片（DocImportPanel）、JSON/CSV 文件（ImportDialog）、AI 生成（AiGeneratePanel，`?panel=ai` 深链高亮，`import/page.tsx:24-33`）。
7. 命令面板：导航「导入词表」、动作「新建词库」（`commandPalette.ts:45,74`）。
8. 间接加词路径：词典检索结果应用（LookupPanel + diff 确认）、AI 管家工具写词（AgentPanel）。

观察：同一意图（把词放进来）至少有 6 个一级入口 + 4 个页内面板 + 2 个间接路径；「导入」一词同时指「整批写进现有词库」与「新建一本词库」两种语义（`/books` 的导入会新建书，`/book` 的导入写进当前书），**语义不统一是「杂乱感」的主因之一**（此条为工程推断，待 R3 竞品 IA 对照佐证）。

## 6. 与 HANDOVER/ROADMAP 的一致性

- HANDOVER §5.1 所列 T5/T6/T1/T4/T7/真混淆/WordQuiz B 均未实现：grep `suspension / buildCloze / confusables / quizCache / leech` 零命中；`queueOrder` 已实现（与文档一致）。
- 本次新增事实（文档未记载）：新词引入顺序固定为列表原序；列表排序/筛选不持久化；导出排序与列表排序两套；mastered 阈值硬编码 21 天；streak 日界为 0 点。

## 7. 待调研回报后补的决策点

- 排序维度集合与持久化位置（store 内容域 vs 本地偏好）。
- 分组依据集合与呈现形态（折叠分区 / 筛选 chips / 子视图），以及「按组学习」如何进队列。
- 新词闪卡自评的评分映射（知道→Good? 先识别验证?）与状态粒度升级路径。
- 词库排除 flag 的存储与同步语义。
- 入口收敛方案（主入口 + 语义统一）。