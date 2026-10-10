# 架构说明

## 总览

```
┌───────────────────────────── 浏览器（本地优先，无后端） ─────────────────────────────┐
│                                                                                      │
│  App Router 页面（客户端组件）                                                        │
│   ├─ /            仪表盘（词库管理）                                                  │
│   ├─ /book/[id]   工作区：词条列表 │ 动态编辑器 │ 实时预览      [字段设计器 Tab]        │
│   ├─ /book/[id]/export  导出工作室（设置面板 + 分页预览 + 三通道导出）                    │
│   ├─ /import      导入向导                                                            │
│   ├─ /skill       AI Skill 说明与下载                                                  │
│   └─ /settings    外观 / 数据源 / 本地词库 / 备份                                        │
│                                                                                      │
│  领域层 src/lib/（纯函数优先，node 可测）                                               │
│   ├─ types.ts          领域模型（Schema/Entry/ExportSettings…）                        │
│   ├─ sections.ts       字段类型注册表：归一化 normalize*、Schema 工厂、切片/长度          │
│   ├─ presets.ts        模板（牛津词典风等 5 套）与示例词库                               │
│   ├─ infer.ts          从词条数据推断字段 Schema                                        │
│   ├─ importer.ts       导入管线 + ECDICT 映射 + draft→values                            │
│   ├─ lookup/           检索适配器：freedict / localdict / http / ai + 并发运行器          │
│   ├─ store.ts          Zustand store + IndexedDB 持久化（防抖 400ms 写入）               │
│   └─ export/           paginate.ts（分页算法）· print.ts（iframe 打印/PNG/PDF/ZIP）      │
│                                                                                      │
│  导出引擎 src/components/export/                                                       │
│   └─ useExportDocument → MeasureLayer（隐藏测量）→ paginate() → PrintDocument（渲染页）  │
│                                                                                      │
│  存储                                                                                 │
│   ├─ IndexedDB: wulonvocab-v1（主状态）  wulonvocab-dicts（本地词库行数据）              │
│   └─ localStorage: 主题偏好（预水合防闪）                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 数据模型（核心设计决策）

1. **词条不预设字段**。`Entry.values` 是 `Record<sectionKey, value>`；`Schema.sections` 定义字段清单。
   渲染器/编辑器按 Schema 动态生成界面——这是「动态字段管理」的实现基础。
2. **每种字段类型有唯一规范值形态**（canonical shape），所有外部数据经 `normalize*` 收敛。
   例如 `senses` 恒为 `SenseItem[]`，`SenseItem` 内的 `examples` 恒为 `ExampleItem[]`。
3. **不丢数据**：Schema 之外的键原样保留在 `values`，编辑器提供「未定义字段 → 提升为字段」，
   字段删除后数据仍在（可提升回来），字段键重命名自动迁移全库数据。
4. **导出设置与 Schema 解耦**：`ExportSettings.sectionVisibility` 可以覆盖 `SectionDef.visible`，
   同一份数据可以有多种排版人格。

## 分页引擎（导出质量的关键）

目标：**屏幕预览 = 打印 = PNG 完全相同**，且页面尺寸毫米级精确。

1. **块规格（BlockSpec）**：把每个词条拆成 `header` 块 + 每字段一个 `section` 块；
   填充为空的字段按设置隐藏或渲染为留白。
2. **测量**：`MeasureLayer` 在屏幕外以真实列宽渲染所有块（以及可拆分块的「标题」与「单单元」变体），
   字体加载完成后统一读取 `getBoundingClientRect()` 高度。测量 DOM 与实际页 DOM 使用**同一批组件**，
   保证高度一致。
3. **分页（纯函数）**：`paginate(blocks, {columns, columnHeight})` 贪心装箱：
   - 列内放不下 → 换列/换页；词条头部与其后首个块用 `glueWithNext` 绑定（孤行控制）；
   - 可拆分块（义项/例句/列表/表格行等）以「单元」为单位跨列续排，切片边界对齐单元，
     续页重复小节标题并标记「（续）」；单个单元超过整列时强行放置（计数 `overflowBlocks`，渲染端裁剪）。
4. **网格模式**：按 `columns × rows` 直接切块，无需测量。
5. **页码与索引**：分页结果记录 `entryFirstPage`，索引页据此生成页码；
   封面的存在与否参与页码偏移（封面不编号）。

## 打印 / 导出通道

| 通道 | 实现 | 特点 |
| --- | --- | --- |
| 矢量 PDF | 隐藏 iframe 克隆 `[data-wv-page]` 节点 + 复制全部样式表 + 动态注入 `@page { size: Wmm Hmm; margin: 0 }` + `iframe.contentWindow.print()` | 文字为矢量、可搜索，字体自动嵌入子集；用户「另存为 PDF」 |
| 图片型 PDF | 每页 `html-to-image.toJpeg`（复用一次 `getFontEmbedCSS`）→ jsPDF `addImage` | 一键直接下载，操作最少 |
| PNG | `html-to-image.toBlob`，pixelRatio 2 / 3.125 / 4（192 / 300 / 384 DPI），多页经 JSZip 打包 | 便于分享、插图 |

所有页面容器为 `width/height = mm` 的 `.wv-page`；打印样式在 `@media print` 中把 `.wv-doc` 展平、
每页 `break-after: page`（最后一页取消），并强制 `print-color-adjust: exact`。

## 状态与持久化

- 单一 Zustand store（`useAppStore`），`persist` 中间件写入 IndexedDB；
- 写入防抖 400ms，`visibilitychange(hidden)` / `beforeunload` 立即冲刷；
- `skipHydration` + Providers 中手动 `rehydrate()`，`hydrated` 前页面显示载入态，避免 SSR 闪空；
- 本地词典的行数据存在独立的 IDB store（`wulonvocab-dicts`），内存按需加载并缓存，避免拖慢主状态。

## 关键库与选型理由（详见 docs/adr/）

- **Next.js App Router**：文件路由 + 便于未来静态部署；所有业务组件为客户端组件，页面仅做壳。
- **Geist**：官方只发布字体包，组件按 Geist 文档规范复刻（令牌取官方实测值），保证视觉一致性。
- **html-to-image**（而非 html2canvas）：基于 foreignObject，真实浏览器光栅化，CJK 排版保真度高。
- **iframe 打印**（而非全局 print CSS）：样式隔离，避免逐个隐藏应用 UI。
