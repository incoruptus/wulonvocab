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
4. React 规则（会构建失败）：不在渲染期调用 `Date.now()/crypto.randomUUID()`（预渲染报错）；不在 effect 里同步 setState；不在渲染期读写 ref。
5. 中文源码文件必须保持 UTF-8（无 BOM）。修改文件用编辑器工具或 Node 脚本；**不要用 PowerShell `Set-Content` 直接改写含中文的文件**（PS5.1 默认 ANSI 会损坏编码）。
6. 打印路径基于隐藏 iframe 克隆 + 动态 `@page`；`@page` 内注入字面 mm 值，不使用 CSS 变量。
7. 分页单元与渲染切片必须对齐（`sliceValue` 不重新归一化，输入须为规范形态）。

## 控件形态约定（审计结论，新代码必须遵守）

- **高度体系**：`xs` 24px / `sm` 32px / `md` 36px / `lg` 40px；同一行的控件必须同高对齐；
- 密集行内工具（列表项操作、义项头工具、表格增删按钮）= `xs`；表单行内的按钮 = `sm`；页头 / 工具栏 = `md`；
- **禁止**用 `className="size-6/size-7"` 之类覆盖 IconButton 尺寸——统一走 `size` 变体；
- `SegmentedControl`：表单内一律 `grow`（等分撑满整行），页头 Tab 场景保持内容宽度；
- 主题 / 系统相关渲染必须读 `useResolvedTheme()`（来自 Providers），**禁止在渲染期访问 `document`**（hydration 不匹配）；
- 移动端复杂设置采用**底部 Tab 工具抽屉**（导出工作室为 4 组：版面 / 卡片 / 外观 / 细节；非模态、预览常驻、
  `role="tablist"/"tab"`、safe-area 内边距），不要用「把侧栏堆在预览上方」的排法；
- 文案风格：具体、有动词、给数字（「3 个词、10 个字段」优于「示例数据」），避免空泛的「强大 / 便捷」；
- **学习会话键位**：翻卡模式桌面 D/F/J/K＝忘记/模糊/记得/轻松（1-4 兼容），空格＝揭示答案 /（揭示后）记得；
  选择题 W/E/I/O＝直选四项（点选＝判定）、F/J＝上一个/下一个词（不评分，跳过词本轮稍后重现）、空格＝继续；
  U 撤销、R 重播、`S` 星标、`?` 快捷键帮助、Esc 退出；键位提示一律用 `Kbd`/`KbdGroup`（`ui/misc.tsx`），
  卡片词头操作按钮（朗读/星标/跳过）统一走 `study/CardActionButton`——**凡有快捷键的动作必须给出键位提示**
  （按钮角标 / 内联键帽 / 底部提示，三者至少其一）；帮助弹窗由 `src/lib/study/keymap.ts` 常量表驱动；
  **键位提示仅在宽屏 + 精细指针显示**（`wv-desktop-only` + `hidden sm:inline-flex` 双重门控），
  触屏/窄屏改用 `wv-touch-only` 点按说明；移动端评级栏用 2×2 网格（`grid-cols-2 sm:grid-cols-4`）；底部操作区必须**原位切换**（揭示按钮 ↔ 评级栏），
  不得叠加新行造成布局位移；忽略 `event.repeat` 与修饰键，答题后 180ms 输入锁防连发；
  window 级键监听先跳过 `ev.defaultPrevented`（Radix 弹窗处理的 Esc 等不再透传）；
- **移动端导航**：窄屏（<sm）主导航为底部 Tab 栏（`app/MobileTabBar.tsx`，5 项、safe-area、当前路由高亮）；
  沉浸式路由（`/study`、`/book/export`）自动隐藏；顶栏窄屏只保留品牌（logo + 名称，可截断）、页面操作与主题；
  页面主容器在移动端必须预留底部空间（普通页 `pb-24`；满屏布局如工作区
  `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`）；
- **列表滑动约定**：右滑＝进入多选（`touch-action: pan-y`、轴锁 8px、展开阈值 50%、全滑阈值 55%），
  左滑＝星标/删除（整条左滑＝删除）；长按 500ms 也可进多选；每个手势动作必须有非手势替代路径
  （复选框 / ⋯ 菜单 / 多选按钮）；删除必须带「撤销」（按原位置恢复）；
- **路由结构**：`/` 品牌首页、`/books` 词库列表、`/learn` 学习中心、`/study?id=` 学习会话、
  `/book?id=` 工作区、`/book/export?id=` 导出工作室。

## 部署约束（GitHub Pages 静态导出）

- 路由参数一律走**查询串**（`/book?id=…`、`/book/export?id=…`）：静态导出不支持动态段；
- 公开目录资源引用必须用 `assetPath()`（`src/lib/paths.ts`）带 `NEXT_PUBLIC_BASE_PATH` 前缀；
- 导出构建 `npm run build:pages`（= `WV_EXPORT=1` + basePath `/wulonvocab`，输出 `out/`）；
  `WV_EXPORT=1` 时自动关闭 cacheComponents/partialPrefetching 并开启 `output: export` + `trailingSlash`；
- 构建后处理会把 Next 段缓存 payload 补成客户端实际请求的点号文件名（静态主机无法重写，勿删）；
- 本地预览：`npm run serve:pages`（4010 端口，模拟 `/wulonvocab` 子路径）。

## 目录红线

- `public/downloads/skill/` 是生成物（由 `scripts/sync-skill.mjs` 生成），不要手工编辑。
- `skill/wulonvocab-json/` 是 Skill 的**唯一真源**；示例与文档改动后跑 `sync:skill`。
