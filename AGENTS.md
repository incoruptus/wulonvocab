# AGENTS.md — WulonVocab 开发约定

面向 AI 代理与协作者的工程约定。修改代码前请先阅读本文件。

## 项目定位

- 名称：WulonVocab（npm 包名必须小写 `wulonvocab`；目录名保持 `WulonVocab`）。
- 本地优先：所有业务数据在浏览器 IndexedDB，无后端；不要引入服务端数据库或云依赖。
- 界面语言：中文（简体），代码标识符用英文。
- 设计系统：Geist（官方字体包 `geist`；组件按 vercel.com/geist 规范复刻，令牌定义在 `src/app/globals.css`）。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发（Turbopack） |
| `npm run build` | 生产构建（必须通过） |
| `npm run typecheck` | `tsc --noEmit`（必须通过） |
| `npm run lint` | ESLint（零 error；warning 尽量清零） |
| `npm test` | Vitest 单测（改核心库必跑） |
| `npm run check:encoding` | 编码守卫：扫描源码字符串中的乱码残留（应为 0） |
| `npm run e2e:sync` | 双设备同步 E2E（无头双上下文；需本地 dev server，不进 CI） |
| `npm run sync:skill` | 修改 `skill/` 后必须运行，使应用内下载同步 |
| `npm run validate -- file.json` | 校验词表 JSON |

## 架构速览

- `src/lib/`（纯领域层，可在 node 环境单测）：
  - `types.ts` 领域模型；`sections.ts` **字段类型注册表**（新增字段类型只改这里 + `ValueView`/`ValueEditor` 两个 switch）；
  - `sections.ts` 内 `normalize*` 是导入容错的核心，改动必须补 `sections.test.ts`；
  - `importer.ts` 导入管线（识别 → 归一化 → 映射 schema）；`infer.ts` 字段推断；
  - `study/` **学习引擎**：`engine.ts`（ts-fsrs 纯函数封装 + 时钟钳制）、`queue.ts`（每日队列/统计）、
    `types.ts`（srs 状态与每日日志）。**预览与评分必须共享同一 `now`**（fuzz 种子一致性），
    改动必须补 `study.test.ts`；学习状态唯一写入路径是 `store.applyReview/undoReview`；
  - `store.ts` Zustand + IndexedDB 持久化（防抖写入），**所有状态写入经由此层**；
    新增默认数据源时同步维护 `DEFAULT_LOOKUP_SOURCES`（`ensureLookupSources` 会在水合后为老用户补齐）；
  - `export/paginate.ts` 分页算法（纯函数，改动必须补 `paginate.test.ts`）；`export/print.ts` 打印/PNG/PDF 出口。
- `src/components/export/`：`useExportDocument`（测量-分页引擎）→ `PrintDocument`（页面渲染）。**测量层与实际渲染必须保持同构**（同一批组件、同样的间距规则），否则分页会漂移。
- `src/components/value/`：字段值的渲染（`ValueView`）与编辑（`ValueEditor`/`SensesEditor`）。导出卡片的排版单位一律用 `em`，随 `.wv-card` 的 font-size 缩放。

## 硬性约束

1. **不要直接编辑 `.kilo/` 或任何全局配置**；项目内配置即代码。
2. 持久化状态只在 `store.ts` 的 actions 中修改；组件不得绕过 `useAppStore`。
3. 新增字段类型时必须同时支持：归一化（sections.ts）、预览渲染（ValueView）、编辑（ValueEditor）、分页可拆性（`SPLITTABLE_TYPES` 视情况）、Skill 参考文档（`skill/wulonvocab-json/references/schema.md`）。
4. React 规则（会构建失败）：不在渲染期调用 `Date.now()/crypto.randomUUID()`（预渲染报错；`defaultSchema()`/
   `createEmptyBook()`/`makeEntry()` 内部走 `uid()`，只能在事件处理器里调用）；不在 effect 里同步 setState；
   不在渲染期读写 ref。
5. 中文源码文件必须保持 UTF-8（无 BOM）。修改文件用编辑器工具或 Node 脚本；**不要用 PowerShell `Set-Content` 直接改写含中文的文件**（PS5.1 默认 ANSI 会损坏编码）。
   **主题上下文类**：瑞士主题必须在卡片/文档根挂 `wv-swiss`（经 `themeRootClass()`），卡片内 chips 由此降为纯文本；
   **有效栏数**：辞书体宽页自动双栏由 `effectiveColumns()` 统一派生——**分页（paginate）与几何（computeGeometry）必须共用同一有效栏数**，任何一处直用 `settings.columns` 都会造成测量-渲染漂移。新增卡片宿主（预览/学习卡/测量层/打印）必须同时接上两者。
6. 打印路径基于隐藏 iframe 克隆 + 动态 `@page`；`@page` 内注入字面 mm 值，不使用 CSS 变量。
7. **导出配置生效约定**：强调色 / 行高 / 字体栈 / 纸张色调必须在 `.wv-doc` 根与页面壳上以 CSS 变量下发
   （`--wv-accent` / `--wv-lh` / `fontFamily` / `--wv-line` / `--wv-soft`，`.wv-card` 会读这些变量），
   且 `MeasureLayer` 与 `PrintDocument` 必须同源；**禁止只在词条卡片上设置这些变量**（封面/索引会拿不到）。
   **字体栈单一真源在 `globals.css` 的 `--font-sans`/`--font-serif`**：中文无衬线首选 HarmonyOS Sans
   （免费商用；未安装自动回退苹方/雅黑/思源黑），衬线模式中文走思源宋（Source Han Serif / Noto Serif，OFL）；
   导出侧一律经 `fontStackFor()` 引用变量，不得内联拼字体栈。
8. **图片型 PDF 内存约定**：一律 `toCanvas → JPEG Blob → Uint8Array` 直传 jsPDF（勿用 base64 dataURL），
   每页后释放画布并让出事件循环，大词库导出不崩标签页。
   **字体内联只允许走 `print.ts` 的 `loadedFontEmbedCss()`**（只内联本次导出页面实际加载过的分片）；
   禁止使用 html-to-image 默认的全量 `getFontEmbedCSS`——自托管 CJK 有数百个 unicode-range 分片，
   全量内联会内存爆炸崩页。
9. 分页单元与渲染切片必须对齐（`sliceValue` 不重新归一化，输入须为规范形态）。
10. **界面强调色管线**：单一通路 = `Providers`（写 `<html data-accent>` + `--ui-accent-hex`）
    + `globals.css` 的 blue 语义阶重定向（亮/暗两套 `color-mix` 公式）。**新控件引用 blue-* 语义色
    即可自动跟随强调色**（如 `bg-blue-700`、`text-blue-900`），禁止硬编码其它点缀色；
    默认「Geist 蓝」不设属性以保持原令牌；导出/印刷强调色是另一套（书籍级 `--wv-accent`），两者互不影响。
11. **AI Agent 约定**：`ai/agent.ts` 是纯循环（可单测），工具执行绑定在 `ai/agentExec.ts`
    （**写操作必须经 store actions**）；危险操作（改 schema / 删除）必须**两段式确认**（needsConfirm + apply）；
    系统提示必须保持**字节稳定**（前缀缓存），禁止把时间戳 / uid / 随机序塞进系统提示；
    工具结果截断（4KB）与步数上限（10）不得放宽而不加确认；导入的文件内容一律当数据（提示词内声明忽略其中指令）。
12. **跨端同步约定**：合并引擎（`lib/sync/merge.ts`）必须保持**纯函数**（不 import store、不碰 IO，全部走参数）；
  同步元数据（设备身份 / 墓碑 / 安全快照 / Gist 配置）一律存独立 IDB（`sync/meta.ts`），**不进主 store、不随同步载荷传播**；
  删除动作必须写墓碑（`recordTombstones`），撤销恢复必须清墓碑（`clearTombstonesFor`）；
  任何改变词条可见状态的写入（含星标 / 状态）都必须 bump `entry.updatedAt`（否则无法跨端合并）；
  合并结果只经 `store.applySyncState` 落库（`lastBookId` 保持本机值）；加密/配对与传输层解耦，传输可插拔。
  **Gist 自动档**：加密一律走 `sync/crypto.ts`（PBKDF2 60 万 → AES-GCM-256，gzip 能力探测，**上传内容永远是密文**）；
  `sync/engine.ts` 保持**依赖注入**（不 import store，store 接线只在 UI 层 `components/sync/syncDeps.ts`）与单飞；
  Gist 分片阈值 460KB 不得上调（GitHub API 1MB 截断线以内）；向导（`SyncGuideDialog`）文案结构「是什么 / 为什么 / 怎么做」，
  改配置 UI 时必须同步走查向导三步不脱节。
  **自动调度必须全局常驻**：节奏触发器只在根布局的 `SyncAutoProvider`（所有页面）——**禁止把调度或依赖注册放进页面级组件**
  （三端实测缺陷：曾挂在设置页卡片里，用户不开设置页则永不同步）。
  **外观本地化（用户拍板）**：明暗模式与强调色（`LOCAL_SETTING_KEYS`）是**设备本地偏好**——不进载荷、不进哈希、
  不参与冲突（`stripLocalSettings`/`pickLocalSettings`；旧包携带也一律剔除；`applySyncState` 回写本机外观）；
  改外观不 bump `updatedAt`、不触发推送。**同步域设置改动立即上云**：`store.setSettings`（同步键）、学习参数
  `setStudyConfig`、数据源 `add/remove` 与 `update`（仅开关类 patch）→ `requestSyncNow()`（成功/失败均有轻提示，
  未配置自动同步时静默）；数据源表单**文本编辑**用 `requestSyncSoon()`（30s 防抖，防逐键风暴）。
  `settings.updatedAt` 由同步域改动 bump 并参与冲突裁决（较新变更胜；平局按 deviceId 确定性裁决——不得绕过）。
  **中转站发现（禁止退回旧逻辑）**：首同步**必须**先 `gistFind()` 在账号内按配对标识认领已有 Gist——
  描述格式 `WulonVocab 跨端同步 · <pairId>`（`pairIdOf(pairCode)`）；迁移期旧描述的中转站也要「拉取 + 解密验证」后认领；
  已连接的设备要收敛到「最新更新的本配对中转站」；「重新创建」经 `excludeGistIds` 跳过旧站。
  **绝不允许「无 gistId 就 POST 新建」**——三端实测主凶：各端各建私有站，gistId 从不共享，配对也永不相遇。
  `multidevice.test.ts`（World 模型）是此行为的回归测试，改传输层必须保持绿。
  **PeerJS 直传（面对面档）**：会话码一码两用（`derivePeerId` 确定性推导信令房间 + 作 AES-GCM 钥匙）；
  信封格式与 Gist 档完全一致（`buildEncryptedEnvelope`/`parseEnvelopeWithCode`），合并复用同步包预览管线；
  分片 40k 字符/帧（`transports/peer.ts`，JSON 转义膨胀余量）；**禁止在此链路引入任何中转服务器**（信令除外）。
  **同步状态单例（globalThis）**：协调器注册表/定时器与引擎状态/订阅/单飞锁必须挂 `globalThis.__wvSyncAuto` /
  `__wvSyncEngine`——Turbopack 同模块多副本或增量缓存陈旧时（实测：设置改动静默、控件加载态失效），
  模块级变量会「丢注册」；**同步相关改动后若出现改动静默/状态不更新，先重启 dev server 再排查**。
  **AI 管家**：流式经 `streamChatCompletionMessage`（`stream:true` 显式开启，默认旧路径保证单测稳定）；
  会话持久化在独立 IDB（`ai/agentStore.ts`，key `chat:<bookId>`）——**聊天记录是设备本地资产，不进主 store、不随同步载荷传播**。
  **OCR**：tesseract.js 动态加载（worker 会话复用，中止即终止重置）；产物经 `extractWordTokens` 清洗为单词 tokens 后走统一导入管线。
  **手账笔记带**：`kind:"band"` 块（`splittable:false` + `glueWithPrev`）——分页器保证与上一块同列；渲染必须同时接 PrintDocument 与 MeasureLayer；2 栏降级单列。

## 术语与品牌（统一口径）

- **正式中文名：乌龙单词**（品牌展示仍为 WulonVocab；中文语境可用「WulonVocab（乌龙单词）」，不用其它译名）。
- **词库** = 应用里的书（books 实体，唯一说法）；**禁止「词书」**；**词表** = 一批词条数据（导入 / 导出 / AI 生成的 JSON 数据面，不是应用实体）。
- **词条** = 词典里的一条记录。
- **同步** = 跨端数据交换（唯一说法）；**「更新」只用于「修改词条 / 新版本」语境，不得指代同步**；
  同步结果计数文案固定为「新增 / 更新 / 删除」（词条级动作）。
- **同步触发点（完整清单，改同步相关代码必须走查）**：
  ① 自动节奏：启动 +5s / 切回前台（≥10min）/ 恢复联网 / 每 30 分钟（`SyncAutoProvider`，全局常驻）；
  ② 设置类改动立即：`setSettings`（同步键）/ `setStudyConfig` / 数据源增删与开关 → `requestSyncNow()`
  （控件经 `useSyncCommit` 显示加载态、云端确认前禁止再改；数据源文本编辑用 `requestSyncSoon()` 防抖）；
  ③ 学习：进入学习中心与学习会话前 `requestSyncNow({silent})`（拉最新）；会话结束 `requestSyncNow({silent})`（推结果）；
  ④ 编辑：进入词条编辑器 `requestSyncNow({silent})`（拉最新）；离开编辑器 `requestSyncSoon(5000)`（推改动）；
  ⑤ 导入：批量导入后 `requestSyncSoon()`（30s）；手动合并同步包后 `requestSyncSoon(10_000)`；导出预设增改删 `requestSyncSoon(10_000)`；
  ⑥ 手动：「立即同步」按钮（手动路径绕过失败退避）。

## 换机迁移（开发机更换时）

1. **旧机收尾**：`git status` 必须干净 → `git push`。一切以 GitHub 仓库为准，**不拷贝目录**。
2. **新机前置**：Node ≥ 20.9、Git；安卓线另需 JDK 17 + Android SDK + Android Studio（本仓库当前开发机之外的机器）。
3. `git clone https://github.com/incoruptus/wulonvocab.git`
   （GitHub 不通时用新机自己的代理：`git config --global http.proxy http://127.0.0.1:<新机端口>`，
   并同步更新本文档「部署约束」中的代理端口）。
4. `npm install`（慢则 `npm config set registry https://registry.npmmirror.com`）。
5. **验证**：`npm run typecheck && npm test`（应 157 全绿）→ `npm run dev` 打开 localhost:3000。
6. **不要拷贝**：`node_modules/`、`.next/`、`out/`、`public/fonts/`、`public/pdfjs/`（首次 dev/build 自动生成）。
7. 无仓库外的私密文件需要搬运（无 .env / keystore；API Key 只存在各自浏览器里）。
8. **到岗体检**：`git log --oneline -5` + `npm test`；安卓线从 `docs/PLAN-2026-10.md` §7（Capacitor 路线）与本文件约定继续。
9. **双机分工**：开发机 A（本机）专注**网页端**；安卓工程在**开发机 B**（有 JDK/SDK/Studio），以 Git 仓库为唯一交接面。
   安卓**实施定稿**见 `docs/ANDROID.md`（含五格 IA、顶栏双层、纵向预算、CI APK、自托管 OTA、keystore 流程）——B 机 Agent 拉库即按其执行。

## 控件形态约定（审计结论，新代码必须遵守）

- **高度体系**：`xs` 24px / `sm` 32px / `md` 36px / `lg` 40px；同一行的控件必须同高对齐；
  **已知刻意例外**：落地页主 CTA `h-11`（营销页放大）、品牌 logo `bg-black`（品牌色）、
  词条预览卡白纸（模拟印刷所见）、导入弹层的「文件 / 粘贴」二选一保持内容宽度（同排有链接，不 `grow`）、
  关于页 GitHub 头像用原生 `<img>`（外链头像 + 静态导出，已带 eslint-disable 说明）——这几处不要再"修正"；
- 密集行内工具（列表项操作、义项头工具、表格增删按钮）= `xs`；表单行内的按钮 = `sm`；页头 / 工具栏 = `md`；
- **禁止**用 `className="size-6/size-7"` 之类覆盖 IconButton 尺寸——统一走 `size` 变体；
- `SegmentedControl`：表单内一律 `grow`（等分撑满整行），页头 Tab 场景保持内容宽度；
- **禁止原生 `<select>` / `<datalist>`**（弹层样式由浏览器决定、不可控、与 Geist 不一致）：
  短列表用 `ui/select.tsx`（Radix Select，Geist 弹层：hover/键盘/勾选/暗色）；
  长列表或需要搜索/自定义值的用 `ui/combobox.tsx`（Popover + 过滤输入 + `allowCustom` + 右侧徽标）；
  表单控件的 `id` 一律由 `Field`/`Labeled` 自动注入（label 关联）；触发器组件（Select/Combobox）必须接收并透传 `id`；
- 主题 / 系统相关渲染必须读 `useResolvedTheme()`（来自 Providers），**禁止在渲染期访问 `document`**（hydration 不匹配）；
- 移动端复杂设置采用**底部 Tab 工具抽屉**（导出工作室为 4 组：版面 / 卡片 / 外观 / 细节；非模态、预览常驻、
  `role="tablist"/"tab"`、safe-area 内边距），不要用「把侧栏堆在预览上方」的排法；
- 文案风格：具体、有动词、给数字（「3 个词、10 个字段」优于「示例数据」），避免空泛的「强大 / 便捷」；
  整体气质**轻盈、有温度**：意象替术语（「管线 / 归一化 / 映射」不出现在 UI 文案里），允许一句轻诗但不堆感叹号；
  **大道至简 ≠ 短句堆砌**：句子要连贯、有条理、有人文逻辑，多个短促口号应合并成通顺叙述；
  **用户可见文案一律不用破折号（——）**，改用逗号、冒号或句号；**不写安全宣言**（「没有账号，也没有云端」这类
  口号式强调禁止出现，隐私与离线能力只在功能语义里自然呈现）；署名行统一「来自 Caddy Wulon · 乌龙罐」；
  关于页承载作者（GitHub 头像 + 主页链接）与项目仓库链接；新文案以 `docs/PLAN-2026-10.md` §4 风格指南为准；
- **学习会话键位**：翻卡模式桌面 D/F/J/K＝忘记/模糊/记得/轻松（1-4 兼容），空格＝揭示答案 /（揭示后）记得；
  选择题 W/E/I/O＝直选四项（点选＝判定）、F/J＝上一个/下一个词（不评分，跳过词本轮稍后重现）、空格＝继续；
  U 撤销、R 重播、`S` 星标、`?` 快捷键帮助、Esc 退出；键位提示一律用 `Kbd`/`KbdGroup`（`ui/misc.tsx`），
  卡片词头操作按钮（朗读/星标/跳过）统一走 `study/CardActionButton`——**凡有快捷键的动作必须给出键位提示**
  （按钮角标 / 内联键帽 / 底部提示，三者至少其一）；帮助弹窗由 `src/lib/study/keymap.ts` 常量表驱动；
  **键位提示仅在宽屏 + 精细指针显示**（`wv-desktop-only` + `hidden sm:inline-flex` 双重门控），
  触屏/窄屏改用 `wv-touch-only` 点按说明；移动端评级栏用 2×2 网格（`grid-cols-2 sm:grid-cols-4`）；底部操作区必须**原位切换**（揭示按钮 ↔ 评级栏），
  不得叠加新行造成布局位移；忽略 `event.repeat` 与修饰键，答题后 180ms 输入锁防连发；
  window 级键监听先跳过 `ev.defaultPrevented`（Radix 弹窗处理的 Esc 等不再透传）；
- **学习题型与调度规则（docs/research/learning-science-2026-10.md）**：
  题型三种（`QuizKind`）：`word2zh` 看词选义 / `zh2word` 看义选词 / `def2word` 看释义选词（英英）；
  按 `quizStageOf` 自动挑题（学习期识别优先，Review 稳定后产出线索优先），缺数据沿顺序降级，全不可用回退翻卡；
  **隐藏词头题型（zh2word/def2word）作答前不显示词头、不出现朗读按钮、选择题一律改为「判定后朗读」**（防泄底）；
  **选择题答对最高记 Good，永不 Easy**；开启「稳 / 猜」确认（`choiceConfidence`）时，答对先确认再记分（猜 → Hard），
  确认期间自动推进暂停（空格 = 稳）；**错题必停留并展示答案**（硬规则，防假知识）；
  **相似词避让（`similarityAvoid` 默认开）**：词形编辑距离 ≤2 或首义项 bigram Jaccard ≥0.6 视为易混，
  队列内至少隔 3 张卡（`avoidSimilarNeighbors` 软约束，绝不阻塞/丢项），回炉插位用 `requeueInsertIndex`；
  「本场允许相似词」为会话级开关（不落库，练易混组用）；
- **移动端导航**：窄屏（<sm）主导航为底部 Tab 栏（`app/MobileTabBar.tsx`，5 项、safe-area、当前路由高亮）；
  沉浸式路由（`/study`、`/book/export`）自动隐藏；顶栏窄屏只保留品牌（logo + 名称，可截断）、页面操作与主题；
  页面主容器在移动端必须预留底部空间（普通页 `pb-24`；满屏布局如工作区
  `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`）；
- **列表滑动约定**：右滑＝进入多选（`touch-action: pan-y`、轴锁 8px、展开阈值 50%、全滑阈值 55%），
  左滑＝星标/删除（整条左滑＝删除）；长按 500ms 也可进多选；每个手势动作必须有非手势替代路径
  （复选框 / ⋯ 菜单 / 多选按钮）；删除必须带「撤销」（按原位置恢复）；
- **全局命令面板**：**Ctrl/⌘+K 是全局唯一快捷键**（其余动作收进面板，避免与表单/会话键位冲突）；
  面板提供 导航 / 最近词库 / 动作（新建词库、开始学习、导出）/ 主题，逻辑在 `lib/commandPalette.ts`（纯函数，可单测），
  组件 `app/CommandPalette.tsx` 挂根布局；入口在 TopNav（桌面门控 + 键帽提示）；新增高频动作须同时登记进面板与本节；
- **路由结构**：`/` 品牌首页、`/books` 词库列表、`/learn` 学习中心、`/study?id=` 学习会话、
  `/book?id=` 工作区、`/book/export?id=` 导出工作室。

## 部署约束（GitHub Pages 静态导出）

- **网络：GitHub 一律走本机代理**（开发机当前为 Clash 端口 `http://127.0.0.1:7890`；**换机后按新机实际端口调整本段**）。
  `gh` / `curl` / `Invoke-WebRequest` 等访问 github.com、github.io、api.github.com 时，务必先设
  `HTTP_PROXY / HTTPS_PROXY`；npm 走官方源或镜像可直连。**换机/compact 后都不要忘**。

- 路由参数一律走**查询串**（`/book?id=…`、`/book/export?id=…`）：静态导出不支持动态段；
- 公开目录资源引用必须用 `assetPath()`（`src/lib/paths.ts`）带 `NEXT_PUBLIC_BASE_PATH` 前缀；
- 导出构建 `npm run build:pages`（= `WV_EXPORT=1` + basePath `/wulonvocab`，输出 `out/`）；
  `WV_EXPORT=1` 时自动关闭 cacheComponents/partialPrefetching 并开启 `output: export` + `trailingSlash`；
- 构建后处理会把 Next 段缓存 payload 补成客户端实际请求的点号文件名（静态主机无法重写，勿删）；
- 本地预览：`npm run serve:pages`（4010 端口，模拟 `/wulonvocab` 子路径）。

## 目录红线

- `public/downloads/skill/` 是生成物（由 `scripts/sync-skill.mjs` 生成），不要手工编辑。
- `skill/wulonvocab-json/` 是 Skill 的**唯一真源**；示例与文档改动后跑 `sync:skill`。

## 版权与资产红线

- **随包字体两类机制**：
  1. **Geist**（npm `geist`，SIL OFL 1.1）与 **思源宋 Noto Serif SC**（npm `@fontsource/noto-serif-sc`，
     SIL OFL 1.1）经模块导入打包（`next/font` / CSS import），可自由嵌入与分发；
  2. **HarmonyOS Sans SC**（华为免费商用许可）：`scripts/sync-fonts.mjs` 在 dev/build 前把
     `harmonyos-sans-sc-webfont-splitted`（cn-font-split 分片）同步到 `public/fonts/harmony/`，
     `layout.tsx` 以 `<link>` 引用——该目录 **gitignore 不提交**，部署产物由构建时生成；
     分片带 unicode-range，浏览器只下载页面实际用到的字形。
- **禁止把字体文件手工提交进仓库**（`public/`、`src/` 不放静态字体文件）；新增字体必须许可为
  免费商用 / OFL / MIT / Apache 等可嵌入类型，并走上表两类机制之一。
- 示例数据与文档内容必须自撰，不得粘贴词典原文；用户导入的词典数据仅存在于其本机 IndexedDB，不入仓库。
