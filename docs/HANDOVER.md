# WulonVocab 交接文档

> 交接日期：2026-11-25 ｜ 面向对象：接手本项目的下一位 Agent
> 一句话：**本地优先（无后端）的单词本网页应用**，0.2.0 已提交并部署到 Pages；0.3.0 已完成 Word Quiz、题库、混搭与同步整理，正在执行发布验收。
>
> **阅读顺序**：`AGENTS.md`（硬约定，必须先读）→ 本文件（现状与待办）→ `docs/PRODUCT-LOGIC.md`（项目结构与逻辑总览）→ `docs/DECISIONS-PENDING.md`（决策状态与外部前置）→ `docs/ROADMAP.md`（路线图与拍板记录）→ `docs/PLAN-2026-11.md`（批次施工与交付记录）→ 需要动学习/题库时先读 `docs/research/word-quiz-definitions-2026-11.md`。`research/word-quiz-2026-10.md` 仅作历史存档。

---

## 1. 状态快照（以本文件为准，2026-11-25 核对）

| 项 | 值 |
|---|---|
| 仓库 | `D:\Creation\Caddy Wulon\WulonVocab`，remote `incoruptus/wulonvocab`，分支 `main` |
| 工作区 | **0.3.0 已通过自动验收，待提交、推送与 Pages 部署**；0.2.0 批次一至三已部署 |
| 最新提交 | `de1997c`，包含全部 0.2.0 学习线改动；0.3.0 改动尚未提交 |
| 版本 | `package.json` = **0.3.0**（0.2.0 已部署，0.1.0 已发布，见下） |
| 已发布 | `v0.1.0` tag + GitHub Release：https://github.com/incoruptus/wulonvocab/releases/tag/v0.1.0 ；`v0.2.0` 与 `v0.3.0` 尚未创建 Release |
| 线上地址 | https://incoruptus.github.io/wulonvocab/ （basePath `/wulonvocab`） |
| 部署 | 0.2.0 已由 `main` 触发 Pages 部署；Actions 运行 `45526355462` 构建与部署均成功；0.3.0 待部署 |
| 公共题库 | 龙已创建公开 Gist `2446bf2794a4c2ff5de271ec7feb9e67`；稳定 Raw 地址为 `https://gist.githubusercontent.com/incoruptus/2446bf2794a4c2ff5de271ec7feb9e67/raw/wulonvocab-public-bank.json`，当前 40 道 approved 题 |
| 测试基线 | **337 单测 / 49 文件**；开发模式与 Pages 静态产物均通过 `e2e:sync` 15/15、`e2e:study-settings` 31/31、真实公共 Gist `e2e:public-bank` 7/7；生产依赖审计 0 漏洞；编码检查 0；类型与 lint 通过；生产构建 19 页与 Pages 导出通过 |

> 2026-11-25：0.2.0 的批次一「秩序与口径」、批次二「初学与状态」与批次三「规则档智能 + 题型」已提交并部署，未创建 tag 或 GitHub Release。0.3.0 新增四子型选择题、独立 Cloze 与混搭、个人/公共题库、四子型独立计时、保存视图与复习事件同步、凭据隔离和关于页原理说明；当前进行发布前全量回归。真机触控与真实设备视觉验收仍待补做。

---

## 2. 项目速览

- **技术栈**：Next.js 16（App Router，静态导出 `out/`）· React 19 · TypeScript 严格 · Tailwind v4 · Geist 设计系统 · Zustand + IndexedDB（idb-keyval）· ts-fsrs 5.4 · Radix UI · sonner。
- **形态**：纯静态站点，**没有任何自有后端**。所有业务数据在浏览器 IndexedDB；跨端同步借助用户的 GitHub Gist（密文）或 PeerJS WebRTC，传输永远加密。
- **路由约定**：静态导出，页面用**查询串**传参（`/book?id=…`、`/study?id=…`、`/book/export?id=…`）。`docs/ARCHITECTURE.md` 里的 `/book/[id]` 写法是早期方案，已过时，以代码为准。
- **领域层**：`src/lib/` 纯函数优先（可测），组件层只做编排。词条内容是学习状态真源；题目运行时由词条、AI、缓存与公共题库共同供给。公共题库的现行设计见 `docs/research/word-quiz-definitions-2026-11.md`，不建立个人 SRS 的静态题目副本。
- **文案红线**（用户可见处）：不用破折号 `——`；不写安全口号；不堆短句；示例内容全部自撰，不得抄词典原文；不出现竞品名。署名「来自 Caddy Wulon · 乌龙罐」。

### 目录速览

```
src/app/            路由（/、/books、/book、/book/export、/learn、/study、/import、/skill、/settings/*）
src/components/     app 壳 / ui 原语 / book 工作区 / study 会话 / export 工作室 / sync / settings
src/lib/            types、sections（14 种字段注册表）、presets、store、importer、infer、
                    study/（engine、queue、quiz、keys、advice、metrics、heatmap、tts、keymap）
                    export/（paginate、print、themes）、lookup/（多源检索、localdict、diff）、
                    sync/（merge、pack、engine、auto、crypto、meta、transports/gist|peer、multidevice.test）
docs/               ROADMAP / PLAN-2026-10 / PLAN-2026-11 / ANDROID / ARCHITECTURE / DATA-FORMAT / EXPORT-GUIDE /
                    adr/（0001–0004）/ research/（13 份调研稿：2026-10 八份 + 2026-11 五份）/ screenshots/（65 张证据截图）
scripts/            check-encoding、build-pages、serve-pages、e2e-sync、e2e-study-settings、e2e-public-bank
```

---

## 3. 环境与日常操作（第一天照做一遍即"体检"）

### 3.1 前置

```powershell
# 工作目录
cd "D:\Creation\Caddy Wulon\WulonVocab"

# 依赖（有 package-lock，优先 npm ci）
npm ci

# GitHub 必须走本机代理（仓库级 git config 已持久化；代理不在线时会 push 失败）
#   代理：http://127.0.0.1:7890
```

### 3.2 验证电池（每次改动后必须全绿再提交）

```powershell
npm run typecheck
npm run lint
npm test                      # 337 / 49 文件
npm run check:encoding        # 必须 0 条
npm run e2e:sync              # 需先起 dev server（localhost:3000），应 15/15
npm run e2e:study-settings    # 复习参数、四子型计时与个人题 CRUD，应 31/31
npm run e2e:public-bank       # 需 WV_PUBLIC_BANK_URL，应 7/7
npm run build:pages           # 静态导出到 out/
```

### 3.3 开发与浏览器验证

```powershell
npm run dev                   # http://localhost:3000
```

- 前端改动后用 **Playwright MCP** 实测（不要只靠类型检查）。
- `kilo-playwright_browser_run_code_unsafe` 只接受**纯 JS**（不能写 TS 断言）；所有 DOM 代码必须包在 `page.evaluate(() => {...})` 内。
- 若"改动静默生效不了"：重启 dev server（Turbopack 增量缓存陈旧是已知问题）。

### 3.4 发布流程（沿用 0.1.0 的做法）

```powershell
git add -A; git commit -m "<中文类型(范围): 摘要>"
git push origin main        # 自动触发 Actions 部署

# 轮询部署（走代理）
$url = "https://api.github.com/repos/incoruptus/wulonvocab/actions/runs?per_page=1"
Invoke-RestMethod -Uri $url -Proxy http://127.0.0.1:7890 -Headers @{ "User-Agent" = "wulonvocab-agent" }
```

- 打版本 tag：`git tag -a v0.3.0 -m "…"; git push origin v0.3.0`。创建 GitHub Release 前仍需龙明确授权。
- 创建 Release 需要 token：`git credential fill` 取本机已存凭据（不要打印到日志），POST `/repos/incoruptus/wulonvocab/releases`（走代理）。

### 3.5 高频坑（详见 AGENTS.md）

1. **编码**：源码 UTF-8 **无 BOM**；中文文件不要用 PowerShell `Set-Content`（会写 BOM / 乱码）。用编辑器工具写入。
2. **不用 `uid()` 造数据于渲染期**：`makeEntry / createEmptyBook / defaultSchema` 内部会生成 uid，只在事件处理器里调用；预览用固定字面量。
3. **测试书**（MCP 浏览器 profile）：`b303a0e9…`（模式烟测 · 7 词）、`022ea75b…`（示例词库 · 10 词 · 全字段）、`5ac9cd3f…`（大书 · 2500 词，性能用）。别的 id 多为历史实验书。
4. **控制台 401 噪声**：测试 profile 里 AI 源 Key 已失效，批量检索日志出现 `401` 属环境噪声，不是 bug。
5. **Gist 上限**：单文件 > 460KB 自动分片（阈值不可上调）；不要往同步载荷里塞生成物/缓存。
6. **sonner 浮层**：`[data-sonner-toast]{pointer-events:auto}` 与移动端抬升在 `globals.css`，别回退。
7. **链接一律 `next/link`**：静态导出带 basePath，`window.location.assign("/x")` 这类硬跳会丢前缀。

---

## 4. 已完成内容（按版本）

### 4.1 v0.1.0（已发布，tag `v0.1.0`）

动态字段体系（14 种字段类型、模板、拖拽、字段提升/重命名迁移）· 词条工作区（嵌套义项编辑 + 实时预览）·
导入（JSON/CSV/NDJSON/Word/PDF/图片，字段推断、容错归一化、校验报告、本机 OCR、HEIC）· 检索（freedict /
零配置综合 / 本地离线词典 ECDICT / AI / 自定义 HTTP，批量 + 字段级差异确认）· 导出工作室（A4/A5/B5/16开/32开、
1–3 栏、确定性分页、封面/索引/页脚、装订边距、矢量 PDF / 图片 PDF / PNG ZIP、四套主题、导出预设、大词库分批测量防卡）·
跨端同步三方式（同步包 merge 引擎 + 墓碑、Gist 自动档 AES-GCM 配对加密 + 配对发现 + 退避、PeerJS 扫码直传）·
AI 词库管家（流式、会话持久化、两段式确认、工具护栏）· 学习引擎 v1（FSRS-6、每日限额、到期队列、四档评级、
TTS、键盘、学习中心、题型 A 扩展、稳/猜确认、相似词避让）· 全局撤销/重做 · 命令面板 ·
批量合并 · 图片字段本地文件 · 设置语义（外观本地化、同步域确认锁定、全场景触发点）· 品牌与文档（ADR/研究报告/ANDROID）。

### 4.2 v0.1.1（已落地；线上部署以实际 push 为准）

对应提交：`7606b03`、`1fb0bff`、`93356a2`、`de67e6b`、`af1a677`、`3748fa9`（另有 0.1.0 定稿 `a19dd72`/`9f79cfa`）。

1. **学习回炉语义重构（用户实测拍板）**：只有「忘记」触发回炉、且卡片仍在学习/重学步；连续忘记持续回炉直到
   给出「模糊/记得/轻松」，**不再有静默次数上限**（此前"每场 1 次"被实测否决）。新增显式出口「**先放下**」
   （X 键 / 内联按钮；词忘过至少一次后出现）：记「忘记」但本轮不再回炉、下次优先复习。选择题答错后同排给出「先放下」。
2. **结束页撤销**：总结页「撤销最后一张的『X』」（U 键）→ 回到会话重新出示该词；撤销逐层可撤。
   `store.undoReview` 写入**合并信号**（lastReview 提升；恢复到未学态时 bump `updatedAt`），撤销后 3s 补推云端，
   防止"云端旧状态倒灌"。
3. **出题顺序**：学习设置「到期优先 / 随机乱序」（`queueOrder` 随学习配置同步；Fisher–Yates，rng 可注入）。
4. **学习中心重构**：7 天柱状图重排（零重叠）· 热力图宽度自适应（13–26 周铺满 + 月份标签 + 今天描边 + 图例）·
   「· 5 分钟前更新」移入标题行。**建议引擎 v3**：积压语气加绝对量门槛、批次数字 ≤ 真实到期数（修复"约 540 个"事故）。
5. **设置页二级化**：`/settings` 为分组索引 + 7 个二级页（study/appearance/sources/dictionaries/sync/data/about），
   统一 `SettingsShell` 返回导航；二级页去重（每页只有一份标题）。学习首页只留基础项（新词上限 / 学习模式 /
   出题顺序 / 本场允许相似词 / 自动发音），高级项迁入「设置 → 学习」（通用组 + 按词库组，`?book=` 深链）。
6. **字段设计移动端**：窄屏列表占满、点按进入**全屏编辑**（`Dialog mobileFull`）；桌面保持双栏。
7. **组件规范修正**：Combobox 选中项显示 label（此前显示原始 value，词库选择器露出 UUID）；列表行右侧控件
   成组（`flex` 包裹消除基线偏移）、开关/⋯/拖动柄精确落中线、拖动柄 24px 点击目标、`pointer-coarse` 触屏兜底。
8. **示例词库升级**：**10 词 × 全部 14 种字段**，显示选项全开、义项子字段逐项补齐、配图用内置 SVG data URL；
   `src/lib/presets.test.ts` 4 条契约测试锁住"10 词 / 全覆盖 / 全填满 / 选项全开"。
9. **学习中心指标口径**：热力图实际范围与「近 N 周复习」一致；柱状图空态文案。

### 4.3 v0.2.0（批次一已交付）

1. **排序与学习顺序**：管理列表 8 维度 × 正倒序、稳定 seed 乱序；当前临时视图偏好进独立 IDB。`newOrder` / `reviewOrder` 随学习配置同步，可检索度只用于复习排序。2026-11-25 起目标改为命名保存视图同步、临时偏好本机。
2. **浏览分区与保存视图**：标签 / 情景标签 / 首字母 / 状态 / 稳固度桶 / 来源，可折叠、计数、空分区、首标签或全标签归属；每书最多保存 20 个视图，不复制词条。
3. **词库三态**：active / paused / archived；暂停与归档退出队列和目标分母，历史保留；归档可恢复原计划或重置学习。书级状态进入既有哈希与合并冲突口径。
4. **添加与导入分流**：全局「导入」保留单页平铺；词库内提供「添加并匹配」，列表搜索无匹配时回车可带入检索，已有词按词头精确定位，新词直接建条。导入合并、只补空缺、替换并重置三种语义保留，精确重复导入幂等。
5. **试用回改**：列表筛选与视图控件收进漏斗弹层；标签移除图标统一并修正纵向对齐。弹层进一步按已存视图 / 筛选 / 排序 / 分组分区，补齐状态计数、字段标签、空态和固定结果栏；桌面与 390px 移动视口均无横向溢出，状态筛选与视图保存通过真实浏览器断言。
6. **验证**：223 单测 / 34 文件、同步 E2E 10/10、类型/规范/编码/构建/Pages 导出全绿；桌面与 390px 移动视口 DOM/截图验证通过，真机触控仍待验收。

### 4.4 批次二首批（2026-11-24 推进）

1. **三步式新词闪卡与短步骤**：教学卡 → 熟悉感路由（不评分）→ 再认验证（正确 Hard、错误 Again 回教学卡）或回忆自评（Good/Hard/Again）；新词 Good 依次在 30 分钟、1 天、3 天后交 FSRS，回忆阶段评分前隐藏答案，答不出停留揭晓。连续回炉、X 停靠、U 逐层撤销与选择题封顶保持。
2. **复习事件同步**：独立 IndexedDB 记录会话、题型、延迟、首评与前后 SRS；撤销写补偿事件。提供单独导出/清理；事件已按稳定 ID 同步，但不进入主 store、history 或词库备份。
3. **记忆表达**：列表与详情显示 R(30)、下次复习；「已掌握」在界面改为「稳固（当前）」。`EntryStatus` 枚举与同步派生不变。
4. **目标与 streak**：20/40/60 三档有效提取目标环、本周 5/7 备用轨道、每周一次自动免费宽恕、streak 开关、默认 4 点且可配置 0–6 的学习日界。
5. **机制说明**：学习设置标题右上角加入问号，点击弹层解释新词验证、FSRS、R(30) 与顽固词处置；首页不再常驻折叠说明。
6. **浏览器验收**：新词两条路径、再认封顶、错题揭晓、停靠不重复评分、两层撤销、日志补偿、R(30)、目标环与设置持久化均通过。
7. **掌握层次派生**：从本机 `review_log` 分别统计再认 / 回忆 / 产出，按会话与层次只取首次评分、每层最多最近 20 次；Hard / Good / Easy 计成功，Again 不计，撤销排除。列表显示紧凑证据，详情显示三格与最近结果；不做综合分，不写回 `EntryStatus`、SRS、同步或备份。

### 4.5 T5 顽固词闭环（2026-11-24 交付）

1. **搁置语义**：`Entry.suspension = { until, at }`，缺省未搁置，解除删字段并 bump `updatedAt`；纳入条目主体哈希与 LWW，双端并行改卡走既有冲突流。复习仍只改 SRS，搁置不改到期时间。
2. **队列与恢复**：`until > now` 时退出新词与复习队列，也不计今日待复习；到期边界自动回归。重置学习进度时同步清除搁置。
3. **提醒与处置**：按词库可配置阈值（默认 8，范围 2–20），半阈值预告；列表与详情显示易忘、顽固词、搁置中状态，筛选漏斗新增对应筛选，小结列出顽固词。
4. **三种动作**：搁置 7 / 30 天、跳到字段编辑改卡、二次确认后降级为未学。降级保留内容、标签与星标，清除 SRS 与搁置；系统不会自动停考。
5. **验证**：252 单测 / 40 文件、同步 E2E 10/10、类型/规范/编码/构建/Pages 导出全绿；合并四例与 World 双设备搁置/解除通过，浏览器覆盖提醒、搁置/解除、筛选、阈值持久化、降级确认与小结。

### 4.6 批次三规则档智能与题型（2026-11-25 交付）

1. **今日计划**：按时间预算、积压与可选考试日期安排复习和新词；时间不足先减新词，积压不删除、不改 due。学习首页显示数量、预计分钟和预算说明。
2. **弱词与学习批次**：本机日志驱动的弱词优先最多占当前复习队列 20%，只重排不增删；学习批次限随机、主题 / 情景标签、来源、频率，新词 5–10 词，复习按 R 升序。
3. **自由练习隔离**：暂停 / 归档词库可进入，每词一次、不回炉；评分与撤销只写本机日志，不改 SRS、每日统计或同步状态，不显示「先放下」。
4. **Cloze 与拼写**：已有例句 ≤12 词、目标恰好一次时生成 Cloze，中文判定后按需揭示；拼写隐藏词头、首评定终身、一字符之差 Hard。IME composition 与输入框全局热键均有隔离。
5. **AI 补句**：显式开启、默认关；生成句仍经本地准入校验，独立本机缓存，可在备份页清理，不进入同步与词库备份。
6. **验证**：286 单测 / 44 文件、同步 E2E 10/10、类型 / lint / 编码 / diff 检查、生产构建与 Pages 导出全绿；真实浏览器 11 项断言与截图 60–65 通过，含自由练习前后 SRS / daily 完全一致和 390px 无横向溢出。

### 4.7 v0.3.0 题型、题库与同步整理（2026-11-25）

1. **Word Quiz 四子型**：`word2def / def2word / zh2word / word2zh` 固定四选项与独立准入；四子型可分别设置 10 / 15 / 20 / 25 / 30 秒，默认 30 / 20 / 15 / 15 秒，旧配置迁移有回归测试。
2. **独立 Cloze 与混搭**：`flip / choice / cloze / mix` 四种学习模式；三大题与选择题子型可调权，确定性平滑轮转，阶段不可用时不偷换其他选择题。
3. **个人与公共题库**：工作区第四个「题库」Tab；个人题 CRUD、导入导出与公共文件生成；个人题按稳定 ID 同步合并并支持墓碑；公共层支持单文件与 64 分片、匿名读取、24 小时缓存与本地复核。
4. **公共 Gist 已配置**：示例十词生成 40 道 approved 题，稳定 Raw 地址见状态快照与 `docs/PUBLIC-QUIZ-GIST.md`。
5. **保存视图与复习事件同步**：命名视图进入 `Wordbook.savedViews`；复习事件采用稳定 ID、撤销补偿、清空标记与 180 天 / 5,000 条确定性保留。
6. **凭据与真源整理**：API Key 与 Authorization 独立本机保存，不进同步或备份；新增 `PRODUCT-LOGIC.md` 与现行 Word Quiz 规范，关于页用四组手风琴呈现。
7. **发布前审计修复**：新建题编辑器改为立即可见对话框；修复阶段降级漏洞、最近词库同步判定、导入即时落盘与倒计时切换首帧；生产依赖公告清零；清理未使用代码；CHANGELOG 按 0.2.0 / 0.3.0 分段。

---

## 5. 未完成清单（按优先级/依赖组织）

> 权威路线图见 `docs/ROADMAP.md`（含 2026-10-14 五项 + **2026-11-17 六项**拍板记录）；学习线批次一施工图见 `docs/PLAN-2026-11.md`。以下是给接手者的"可执行清单"。

### 5.1 学习线（0.3.0 已实现；后续统计档待数据积累）

| 项 | 状态 | 关键依据/已拍板要点 |
|---|---|---|
| **T5 顽固词（leech）闭环** | 已交付 | `Entry.suspension = { until, at }` 随条目主体 LWW 与 `entryMaterialHash` 同步；队列按 `until > now` 过滤，到期自动回归且不改 SRS。默认阈值 8、可配置 2–20，半阈值预告；列表/详情/小结可见，支持搁置 7/30 天、改卡与确认后降级重学。merge 四例与 World 双设备用例已覆盖。 |
| **T6 目标环 + 宽恕 streak** | 首批已交付 | 20/40/60 三档有效提取目标环、本周 5/7 备用轨道、每周一次自动免费宽恕、streak 开关、默认 4 点可配置 0–6 学习日。会话止损仍暂缓。 |
| **T1 题型轮换** | 已交付 | 按学习阶段接入再认 / 回忆 / 产出，Cloze 与拼写均保留选择题 / 翻卡回退；隐藏词头判定后才朗读。 |
| **T2 余项** | 部分交付 | 本机日志已采集答题时延，弱词队列使用「慢而对」轻量信号；隐藏模式键位提示细化仍待做。 |
| **T4 例句 Cloze + 双语按需** | 已交付 | `buildCloze` 只接受 ≤12 词、目标恰好一次的已有例句；AI 补句显式开启、默认关，生成句仍经同一校验并缓存于本机。 |
| **T7 拼写题（IME 安全）** | 已交付 | 一字符之差记 Hard，首次提交定终身；composition 期间禁止提交，输入框不触发全局评分热键，提交后只显示反馈。 |
| **「真混淆」干扰项流水线** | 部分实现 | 现行规范见 `research/word-quiz-definitions-2026-11.md`。四选项固定为 1 个正确答案、1–2 个真正易混项，其余为对照项；已接入同词性离线启发式、显式 AI 与公共题库，手工确认与个人错题图仍待补。无法组成四个合格选项时不出题。 |
| **例句挖空（Cloze）** | 已交付 | 独立提取练习，不属 Word Quiz；B2 的来源想法是给句填空，当前产品命名为 Cloze。真实例句 ≤12 词、目标恰好一次，中文按需揭示；AI 补句显式开启、默认关，生成句经本地校验并缓存于本机。 |
| **Word Quiz B1（用户可见「选择题」）** | 已实现 | 合并现有三种选择题并新增 `word2def`，四子型为 `word2def / def2word / zh2word / word2zh`；每题四选项、四子型默认 30 / 20 / 15 / 15 秒、最多两个真正易混项。已接入显式 AI、公共 Gist 读取、本机缓存、贡献包与举报；社区仓库与 OAuth 上传受外部前置阻塞。 |
| **v1.2 FSRS 参数优化** | 待实施（低优先） | 复习日志训练 w 向量（@open-spaced-repetition/binding），需积累真实日志后再做。 |

### 2026-11-25 结构与同步整理（部分已交付）

| 项 | 当前状态 | 目标 |
|---|---|---|
| 按词库复习参数 | 已迁入词库工作区「复习参数」Tab | 旧 `/settings/study?book=` 深链自动兼容 |
| 命名保存视图 | 已进入 `Wordbook.savedViews` 并随书同步 | 当前排序、筛选与折叠态仍本机 |
| 复习事件 | 已同步稳定 ID、撤销补偿与清空标记 | 180 天 / 5,000 条确定性滚动保留 |
| API Key 与 Authorization | 已迁入独立本机凭据库 | 同步包与备份只保留非凭据配置；旧值自动迁移并擦除 |
| 关于页原理 | 已实现四组手风琴 | 数据与同步、学习与题型、字段导入导出、公共题库；已加大长文标题与段落间距 |
| 独立 Cloze 与混搭 | 已实现 | `quizMode = flip / choice / cloze / mix`；三大题与四个选择题子型独立调权，确定性平滑轮转，新词验证不变 |
| 个人与公共题库 | 已实现 | 工作区新增「题库」；个人题随词库合并并支持墓碑，公共 / 个人 / 个人优先两层可选；示例十词 40 道编辑题；Gist 固定 revision Raw 地址自动规范为最新地址 |

**2026-11-17 新增：批次一「秩序与口径」（2026-11-24 已交付；施工图 `docs/PLAN-2026-11.md`，交付记录见 §12）**

| 项 | 状态 | 已落地要点 |
|---|---|---|
| **D1 排序与学习顺序** | 已交付 | 管理列表 8 维度 × 方向 + 独立 IDB 视图偏好；`StudyConfig.newOrder` / `reviewOrder` 随同步，先排序再切片，乱序只存 seed。本轮不做 `Entry.order` / 拖动重排 |
| **D2 浏览分区** | 已交付 | 标签/情景标签/首字母/状态/稳固度桶/来源，折叠 + 计数 + 未标记兜底 + 保存视图；不复制词条，学习批次仍留批次三 |
| **D4 词库三态** | 已交付 | `active/paused/archived`；`setBookStudyState` 走 `patchBook`；书级 LWW + 合并/序列化/备份覆盖；队列统一拦截；hub 目标分母只算 active，历史不抹掉；恢复不改 due |
| **D5 入口收敛** | 已交付 | 全局导入页平铺；词库内「添加并匹配」+ 列表搜索带入；已有词精确匹配、新词建条；合并/补空缺保留 SRS，替换重置并二次确认；重复导入幂等 |
| **D3 三步式初学与状态表达** | 首批已交付 | 熟悉感只路由；再认正确 Hard、错 Again 回教学卡；回忆 Good/Hard/Again，评分前隐藏答案，答不出揭晓；R(30) 与「稳固（当前）」展示；复习事件已按稳定 ID 同步 |

> **待补验收**：真机触控与真实设备视觉；数万条词库全量列表帧率。0.2.0 已完成 commit / push / Pages 部署。

> **批次顺序已更新（2026-11-17）**：批次一 = D1/D2/D4/D5（秩序与口径）→ 批次二 = 三步式新词 + R(30) 展示 + `review_log` + T6 + T5 →
> 批次三 = 规则档智能 + 学习批次进队列 + T4 Cloze + T7 拼写（**2026-11-25 已交付，见 `docs/PLAN-2026-11.md` §17**）→ 批次四 = FSRS 参数优化（**门槛：本机复习日志 ≥2000 条**）。
> 旧建议「批次一 = T5 + T6」**已被取代**（T5/T6 移入批次二）。四项拍板全文见 `docs/ROADMAP.md` 的 2026-11-17 记录与 `docs/research/decision-2026-11.md`。

### 5.2 公共 Word Quiz 题库（读取已实现，社区端待外部前置）

- **维护真源**：公共 GitHub 仓库，使用 Issues / Pull Requests 承载举报、纠错、审核与版本记录。
- **分发镜像**：公共 Gist，由 GitHub Actions 生成清单与按词哈希的 64 个分片；应用匿名读取，不一次拉全库。
- **应用读取**：先查词是否已有题，再按需下载对应分片；本机缓存 24 小时，离线复用，所有题目再过同一本地校验器。也支持个人题一键生成的单文件公共题库。
- **分层与示例题**：每个词库可选公共、个人或个人优先两层；个人题保存于 `Wordbook.personalQuizBank`，按 ID 合并并写删除墓碑。示例十词的四子型共 40 题可直接作为内置编辑题使用。
- **配置指南**：`docs/PUBLIC-QUIZ-GIST.md` 记录创建公开 Gist、复制 Raw 地址、应用内启用与更新排查步骤。
- **贡献包**：显示完整预览，生成标准化 JSON；仅含题目、词性、难度、署名与用户选择的 CC0 / CC-BY-4.0 许可，不含学习数据或凭据。
- **上传**：注册 GitHub OAuth Application 后再开应用内授权上传；未注册前提供仓库贡献入口与贡献包下载。
- **举报与纠错**：本地立即隔离，附稳定题目 ID 与版本；纠错生成修改包，不静默覆盖社区题目。
- **外部前置**：仓库账号、名称与公开范围须在创建前确认；OAuth 客户端标识尚未注册。
- **M3 其余**：`.wvpack` 词库分享包 · 插件化数据源 · PWA / Tauri 可选 · 多语言 en/zh。

### 5.3 校准小件（`docs/PLAN-2026-10.md` §9/§10 遗留，各约半天）

- 辞书体「行内标签 run-in」短字段排版；主题缩略卡 hover 真实组件微缩；主题校准清单（1px 线可见度、横线 pitch 与文字基线、剪裁线不可打印边、PNG 体积）。
- Agent 工具成功率记忆（tools 降级探测，source+model 维度）；图片 token 预估上屏；Anthropic 直连浏览器头；设置「清除密钥」显式按钮；WebDAV 同步档（可选未选档，需先验证坚果云 CORS）；>5 万条导出升级 Web Worker 测量。

### 5.4 跨机与发布

- **Android 首发**：开发机 B 按 `docs/ANDROID.md`（Capacitor 8 + CI 签名 APK + 自托管 OTA）执行；完成后挂 0.1.0 版本线。
- **视觉链路真机 E2E**：被环境阻塞（需可用的视觉模型 Key；当前测试 profile 的 AI Key 已失效 401）。
- **0.3.0 发版状态**：代码已完成自动验收，待提交、推送与 Pages 部署；计划创建 `v0.3.0` tag，是否另建 GitHub Release 待龙确认。
- **0.2.0 发版状态**：代码已推送并部署 Pages，未打 `v0.2.0` tag 或创建 Release。

### 5.5 已知限制（有意为之，不要"修"）

打印以 Chromium 系最佳（Safari/Firefox `@page` 行为差异）· 超大词库（>5 万）导出内存敏感 · 单条超长内容裁剪 · iOS 需 Mac+$99（观察）· 鸿蒙 NEXT（观察）· CRDT 明确不上。

---

## 6. 关键实现约定（接手后最容易踩的，完整版见 AGENTS.md）

| 主题 | 约定 |
|---|---|
| 数据写入 | 一律走 `store`（Zustand 中间件 + 防抖 400ms 落 IDB）；同步元数据放独立 IDB；`lib/sync/merge.ts` 保持纯函数 |
| 撤销/重做 | `lib/history.ts` 只跟踪内容域（books/lookupSources/dictionaries/exportPresets）；评分、`applySyncState`、`importBackupJson` 必须 suppress；undo/redo 后 `alignTombstones` |
| 撤销合并信号 | `undoReview` 恢复 before 时把 `lastReview` 提到撤销时刻；恢复到未学态 bump `updatedAt`（`localReset` 语义） |
| 学习会话 | 忘记→持续回炉（无静默上限）；X=先放下；U=逐层撤销（总结页也可用）；`choiceKeys` 默认 WEIO（保留键 F/J/R/S/U）；`studyExit` 三去向；相似词避让默认开、本场可放行 |
| 同步 | 删除写墓碑、恢复清墓碑；任何改变条目可见状态的写入 bump `updatedAt`；Gist 460KB 分片；外观（theme/accent）本地化不同步；`settings.updatedAt` 参与冲突 |
| 设置 IA | `/settings` 只做索引；新增设置就近入二级页；学习首页只留基础项 |
| 布局 | 单一断点 `sm`；移动端底部 Tab（`/study`、`/book/export` 沉浸隐藏）；窄屏「列表→详情」用点入全屏编辑；列表行右侧控件成组、中线对齐、xs=24px；间距基线（密集行 ≥12px / 内容卡 ≥16px / 页面容器 px-4→px-6 / 结束页 py-8） |
| 文案 | 用户可见处无 `——`；无安全口号；不堆短句；示例全自撰；无竞品名 |
| 兼容 | 交互组件用 Radix + 现有 ui 原语；键盘功能必须给 `<Kbd>` 提示（`wv-desktop-only hidden sm:inline-flex`） |

---

## 7. 测试资产与证据

- **单测**（49 文件 / 335 用例）：领域层为主，覆盖分页、归一化、导入、合并、同步、学习引擎、四子型计时迁移、阶段降级、题库 URL 与个人题合并、保存视图、复习事件、凭据隔离及示例题契约。
- **同步 E2E**：`scripts/e2e-sync.mjs`，15 项断言，先启 dev server，不进 CI，手动跑。
- **学习设置 E2E**：`scripts/e2e-study-settings.mjs`，31 项断言，覆盖学习模式、四子型实际倒计时、个人题 CRUD 与桌面 / 390px 对话框可见性。
- **公共题库 E2E**：`scripts/e2e-public-bank.mjs`，7 项断言，读取真实 Gist 并验证 `word2def`。
- **证据截图**：`docs/screenshots/` 65 张（编号对应各批次交付；最新：`60-63` 为今日计划 / Cloze 隐藏答案 / Cloze 反馈 / 拼写隐藏词头，`64-65` 为自由练习批次首页 / 移动端批次首页）。
- **研究稿**（`docs/research/`）：learning-science、distractors-confusable、word-quiz、themes、sync、dicts-ecdict、ai-providers、agent-multimodal（各稿末章有开放问题，实施前对照）。
- **ADR**：`docs/adr/0001–0004`（App Router 客户端优先 / 确定性分页 / Schema 驱动动态字段 / 本地优先 IndexedDB）。

---

## 8. 建议的接手第一步

1. **体检**：`npm ci` → 跑 §3.2 五条验证（全绿 = 环境就绪）。
2. **读文档**：AGENTS → 本文件 → ROADMAP（含拍板记录）→ 对应研究稿。
3. **选批次**：0.3.0 题型与题库已收口，下一步优先收集真实使用反馈；批次四统计档须等本机复习日志 ≥2000 条。真机触控与真实设备视觉验收仍需补做；内容生态线仍先补设计稿等拍板。
4. **每个批次的工作流**：实现 → 单测/浏览器实测 → 验证电池 → 截图入 `docs/screenshots/` → 按实际发布版本更新 CHANGELOG 与 AGENTS → 中文 commit → push → 轮询部署 → 汇报。
5. **发布**：0.3.0 自动验收通过后提交并部署，创建 `v0.3.0` tag；Android 产物仍挂 0.1.0 线。

---

## 9. 风险登记

| 风险 | 说明/对策 |
|---|---|
| 代理依赖 | GitHub push 与 API 轮询依赖 `127.0.0.1:7890`；代理不在线时失败属环境问题，重试即可 |
| 凭据 | push 凭据在 Windows 凭据管理器；发 Release 用 `git credential fill` 取用，勿打印 |
| 浏览器目录不可拷 | 换机以 **git 仓库为准**，不要拷贝 node_modules/.next/out；测试书属于浏览器 profile，不会随库迁移 |
| 学习语义回归 | 回炉/先放下/撤销/合并信号均有单测与实测基线，改动学习会话前先看 AGENTS 对应段落与 `study.test.ts` |
| 示例数据退化 | `presets.test.ts` 契约测试会拦住"少于 10 词 / 字段缺失 / 选项被关" |
| 依赖告警 | 以官方 registry 执行 `npm audit --omit=dev`；0.3.0 已清零生产依赖公告，Next 16.4.6、Zod 4.6.7、DOMPurify 3.5.0 |

---

*本文件于 2026-11-25 更新至 0.3.0 发布前状态。若后续有新的拍板或路线变化，请同步更新本文件第 1/5/8 节与 ROADMAP 的拍板记录。*
