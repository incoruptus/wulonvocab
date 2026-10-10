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
| `npm run sync:skill` | 修改 `skill/` 后必须运行，使应用内下载同步 |
| `npm run validate -- file.json` | 校验词表 JSON |

## 架构速览

- `src/lib/`（纯领域层，可在 node 环境单测）：
  - `types.ts` 领域模型；`sections.ts` **字段类型注册表**（新增字段类型只改这里 + `ValueView`/`ValueEditor` 两个 switch）；
  - `sections.ts` 内 `normalize*` 是导入容错的核心，改动必须补 `sections.test.ts`；
  - `importer.ts` 导入管线（识别 → 归一化 → 映射 schema）；`infer.ts` 字段推断；
  - `store.ts` Zustand + IndexedDB 持久化（防抖写入），**所有状态写入经由此层**；
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
- 文案风格：具体、有动词、给数字（「3 个词、10 个字段」优于「示例数据」），避免空泛的「强大 / 便捷」。

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
