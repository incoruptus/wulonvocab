# WulonVocab 交接文档

> 交接日期：2026-11-17 ｜ 面向对象：接手本项目的下一位 Agent
> 一句话：**本地优先（无后端）的单词本网页应用**，已完成 0.1.0 发布，当前处于 **0.1.1** 开发周期。
>
> **阅读顺序**：`AGENTS.md`（硬约定，必须先读）→ 本文件（现状与待办）→ `docs/ROADMAP.md`（路线图与拍板记录）→ 需要动学习/题库时再读 `docs/research/*` 对应调研稿。

---

## 1. 状态快照（以本文件为准，2026-11-17 核对）

| 项 | 值 |
|---|---|
| 仓库 | `D:\Creation\Caddy Wulon\WulonVocab`，remote `incoruptus/wulonvocab`，分支 `main` |
| 工作区 | **干净**（无未提交改动） |
| 最新提交 | `7606b03`（2026-10-14 11:33 +0800，示例词库升级） |
| 版本 | `package.json` = **0.1.1**（0.1.0 已发布，见下） |
| 已发布 | `v0.1.0` tag + GitHub Release：https://github.com/incoruptus/wulonvocab/releases/tag/v0.1.0 （网页版首发；Android APK 就绪后挂 0.1.0 线补产物） |
| 线上地址 | https://incoruptus.github.io/wulonvocab/ （basePath `/wulonvocab`） |
| 部署 | push `main` 触发 `.github/workflows/deploy-pages.yml`；本机最后一次部署 `7606b03` success |
| 测试基线 | **203 单测 / 30 文件全绿**；`e2e:sync` 10/10；`check:encoding` 0；`build:pages` 通过 |

> 2026-10-14 之后仓库无新提交；本文件是"从 7606b03 继续"的完整上下文。

---

## 2. 项目速览

- **技术栈**：Next.js 16（App Router，静态导出 `out/`）· React 19 · TypeScript 严格 · Tailwind v4 · Geist 设计系统 · Zustand + IndexedDB（idb-keyval）· ts-fsrs 5.4 · Radix UI · sonner。
- **形态**：纯静态站点，**没有任何自有后端**。所有业务数据在浏览器 IndexedDB；跨端同步借助用户的 GitHub Gist（密文）或 PeerJS WebRTC，传输永远加密。
- **路由约定**：静态导出，页面用**查询串**传参（`/book?id=…`、`/study?id=…`、`/book/export?id=…`）。`docs/ARCHITECTURE.md` 里的 `/book/[id]` 写法是早期方案，已过时，以代码为准。
- **领域层**：`src/lib/` 纯函数优先（可测），组件层只做编排。词条是**唯一真源**，题目应在运行时生成、不建静态题库实体（见 §4.2 的边界说明）。
- **文案红线**（用户可见处）：不用破折号 `——`；不写安全口号；不堆短句；示例内容全部自撰，不得抄词典原文；不出现竞品名。署名「来自 Caddy Wulon · 乌龙罐」。

### 目录速览

```
src/app/            路由（/、/books、/book、/book/export、/learn、/study、/import、/skill、/settings/*）
src/components/     app 壳 / ui 原语 / book 工作区 / study 会话 / export 工作室 / sync / settings
src/lib/            types、sections（14 种字段注册表）、presets、store、importer、infer、
                    study/（engine、queue、quiz、keys、advice、metrics、heatmap、tts、keymap）
                    export/（paginate、print、themes）、lookup/（多源检索、localdict、diff）、
                    sync/（merge、pack、engine、auto、crypto、meta、transports/gist|peer、multidevice.test）
docs/               ROADMAP / PLAN-2026-10 / ANDROID / ARCHITECTURE / DATA-FORMAT / EXPORT-GUIDE /
                    adr/（0001–0004）/ research/（7 份调研稿）/ screenshots/（53 张证据截图）
scripts/            check-encoding.mjs、e2e-sync.mjs
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
npm test                      # 203 / 30 文件
npm run check:encoding        # 必须 0 条
node scripts/e2e-sync.mjs     # 需先起 dev server（localhost:3000），应 10/10
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

- 打版本 tag：`git tag -a v0.1.1 -m "…"; git push origin v0.1.1`。
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

### 4.2 v0.1.1（已落地、未发版；全部已部署到线上）

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

---

## 5. 未完成清单（按优先级/依赖组织）

> 权威路线图见 `docs/ROADMAP.md`（含 2026-10-14 五项拍板记录）。以下是给接手者的"可执行清单"。

### 5.1 学习线（0.1.1 主战场；调研已定稿，多数已拍板）

| 项 | 状态 | 关键依据/已拍板要点 |
|---|---|---|
| **T5 顽固词（leech）闭环** | 待实施 | 依据 `research/learning-science-2026-10.md` T5。已拍板：**搁置进跨端同步**。语义：`Entry.suspension = { until, at }`（缺省=未搁置；解除=删字段并 bump `updatedAt`）；随主体 LWW（updatedAt+deviceId）并**纳入 `entryMaterialHash`**（双端并行改动走既有冲突流，不静默丢）；复习只动 srs 不动主体；队列过滤 `until > now`；配 merge 三例（单侧搁置/单侧解除/双改冲突）+ World 模型双设备用例。另含：`lapses ≥ 8` 标记（可配置）、半阈值预告、小结/筛选可见、三动作（搁置 7/30 天 / 改卡跳编辑 / 降级建议） |
| **T6 目标环 + 宽恕 streak** | 待实施 | 已拍板：streak **用户可开关、默认开**；开启时每周一次自动宽恕（漏一天不清零，代替手动补签）+ **凌晨 4 点日界**；关闭则完全不显示、不参与文案。会话止损（「今天先到这」）**暂缓**（阈值属工程推断，宁晚勿早）。 |
| **T1 题型轮换 + T2 余项** | 待实施 | 按 srs 阶段自动轮换（识别→回忆→产出）；答题时延信号作排序权重；隐藏模式下的键位提示细化。 |
| **T4 例句 Cloze + 双语按需** | 待实施 | 已拍板：缺例句时允许 AI 补句，**显式开关、默认关**。`buildCloze` 纯函数（≤12 词、变形识别、缺例句优雅回退）；揭示顺序「英文整句 → 中文按需」。 |
| **T7 拼写题（IME 安全）** | 待实施 | 已拍板：一字符之差记 **Hard**（非 Again）；**首次提交定终身**；不做「再试一次」覆盖首评（只作学习反馈）。之后接听音题型。 |
| **「真混淆」干扰项流水线** | 待实施 | 依据 `research/distractors-confusable-2026-10.md`。四层候选：手工/AI 确认的 `Entry.quiz.confusables` → 个人错题图 → AI 缓存 → 离线启发式底座（gloss 重叠 + 形近 + 标签共现）→ 兜底随机；不足 3 项回退翻卡；选项带来源徽标；答错必须给差异反馈。 |
| **Word Quiz 题型 B（B1/B2）** | 待实施 | 依据 `research/word-quiz-2026-10.md`；**默认关、实验开关**；B1 单错判定优先；依赖 AI 生成管线与用法资料覆盖率评估。生成物走本机缓存（`quizCache` 独立 IDB、指纹失效、LRU ≤5MB、不进同步载荷）。 |
| **v1.2 FSRS 参数优化** | 待实施（低优先） | 复习日志训练 w 向量（@open-spaced-repetition/binding），需积累真实日志后再做。 |

> 学习线两批建议：**批次一 = T5 + T6**（先把学习闭环补完）；**批次二 = T1/T2 余项 + 校准小件**；
> **批次三（可滚动）= T4 / T7 / 真混淆 / Word Quiz B**。

### 5.2 内容生态线（方案已充分讨论，**未落 docs、未拍板**）

- **官方题库包（分发层）**：静态内容包（与 ECDICT 一键下载同机制），我们离线生产（AI 批量生成 → 复用出题引擎校验纯函数 → 人工抽查 → 打包发版），应用内按来源优先级合并（官方包 ≥ 用户手工 ≥ 错题图 ≥ AI 缓存 ≥ 启发式 ≥ 兜底）。包按**规范化词头 + 义项锚点**索引（不能用 entry id）。
- **一键贡献（回传层）**：GitHub Device Flow（一次性授权 `gist` + `public_repo`）+ 「Gist + Issue」投递（比 fork+PR 失败面小）；仓库侧 Action 拉取 gist → 跑校验器 → 归档 `contributions/`；用户端始终提供「导出贡献包文件」兜底。**相关方案讨论只存在对话里**，接手者若要推进，先补成设计稿并让产品方拍板。
- **待拍板（从未回答）**：① 路线 L1→L2 还是直接评估 L3（自有接收端，会破"无后端"）；② 贡献者授权条款文案；③ 首批覆盖（内置标准词表优先 vs 通用匹配）；④ `.wvpack` 家族化还是独立 `.wvquiz`。以及干扰项相关：`confusables` 随同步（建议是）；干扰项是否允许未学词（建议默认否）；同形异义接受任一义项；举报题软判 + 本机隔离；易混关系是否在词条详情只读展示（建议加）。
- **M3 其余**：`.wvpack` 词库分享包 · 插件化数据源 · PWA / Tauri 可选 · 多语言 en/zh。

### 5.3 校准小件（`docs/PLAN-2026-10.md` §9/§10 遗留，各约半天）

- 辞书体「行内标签 run-in」短字段排版；主题缩略卡 hover 真实组件微缩；主题校准清单（1px 线可见度、横线 pitch 与文字基线、剪裁线不可打印边、PNG 体积）。
- Agent 工具成功率记忆（tools 降级探测，source+model 维度）；图片 token 预估上屏；Anthropic 直连浏览器头；设置「清除密钥」显式按钮；WebDAV 同步档（可选未选档，需先验证坚果云 CORS）；>5 万条导出升级 Web Worker 测量。

### 5.4 跨机与发布

- **Android 首发**：开发机 B 按 `docs/ANDROID.md`（Capacitor 8 + CI 签名 APK + 自托管 OTA）执行；完成后挂 0.1.0 版本线。
- **视觉链路真机 E2E**：被环境阻塞（需可用的视觉模型 Key；当前测试 profile 的 AI Key 已失效 401）。
- **0.1.1 发版**：功能收敛后 `git tag v0.1.1` + Release（流程见 §3.4）。

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

- **单测**（30 文件 / 203 用例）：领域层为主（分页、归一化、导入、合并、同步 merge/分片、学习引擎/队列/避让/键位/建议/热力图、导出 diff、命令面板、示例词库契约）。
- **同步 E2E**：`scripts/e2e-sync.mjs`（双上下文 10 项断言；先启 dev server；不进 CI，手动跑）。
- **证据截图**：`docs/screenshots/` 53 张（编号对应各批次交付；最新：`48-52` 为设置二级化 / 学习首页精简 / 学习设置 / 移动端字段编辑 / 示例词库）。
- **研究稿**（`docs/research/`）：learning-science、distractors-confusable、word-quiz、themes、sync、dicts-ecdict、ai-providers、agent-multimodal（各稿末章有开放问题，实施前对照）。
- **ADR**：`docs/adr/0001–0004`（App Router 客户端优先 / 确定性分页 / Schema 驱动动态字段 / 本地优先 IndexedDB）。

---

## 8. 建议的接手第一步

1. **体检**：`npm ci` → 跑 §3.2 五条验证（全绿 = 环境就绪）。
2. **读文档**：AGENTS → 本文件 → ROADMAP（含拍板记录）→ 对应研究稿。
3. **选批次**：默认从 **T5 + T6** 开始；若产品方优先内容生态，则先出「题库包 + 一键贡献」设计稿（§5.2）等拍板，同时可并行 Word Quiz A 族（无 AI 依赖）。
4. **每个批次的工作流**：实现 → 单测/浏览器实测（Playwright MCP）→ 五条验证 → 截图入 `docs/screenshots/` → CHANGELOG（`[未发布]`）+ AGENTS（若新增约定）→ 中文 commit → push → 轮询部署 → 汇报（含实测证据）。
5. **发布**：0.1.1 全部完成后打 tag + Release；Android 产物挂 0.1.0 线。

---

## 9. 风险登记

| 风险 | 说明/对策 |
|---|---|
| 代理依赖 | GitHub push 与 API 轮询依赖 `127.0.0.1:7890`；代理不在线时失败属环境问题，重试即可 |
| 凭据 | push 凭据在 Windows 凭据管理器；发 Release 用 `git credential fill` 取用，勿打印 |
| 浏览器目录不可拷 | 换机以 **git 仓库为准**，不要拷贝 node_modules/.next/out；测试书属于浏览器 profile，不会随库迁移 |
| 学习语义回归 | 回炉/先放下/撤销/合并信号均有单测与实测基线，改动学习会话前先看 AGENTS 对应段落与 `study.test.ts` |
| 示例数据退化 | `presets.test.ts` 契约测试会拦住"少于 10 词 / 字段缺失 / 选项被关" |
| 依赖告警 | mammoth → sprintf-js（≤1.1.3 无上游修复，overrides 到 1.1.3，仅内部错误文案路径可达） |

---

*本文件由上一任 Agent 于 2026-11-17 整理。若后续有新的拍板或路线变化，请同步更新本文件第 5/8 节与 ROADMAP 的拍板记录。*
