# ADR-0004：本地优先存储（IndexedDB + Zustand 持久化）

日期：2026-10-10 · 状态：已采纳

## 背景

词库数据体量大（本地词库可达数十万行）、隐私要求高（个人学习数据）、且无后端。
localStorage 5MB 上限与同步 API 均不合适。

## 决策

- 主状态：单个 Zustand store，`persist` 中间件 → **IndexedDB**（`idb-keyval` 适配器）；
- 写入**防抖 400ms**，页面隐藏/关闭时冲刷，避免高频编辑的写放大；
- 本地词库行数据独立 store（`wulonvocab-dicts`），按需加载 + 内存缓存，不进入主状态；
- 水合：`skipHydration` + 挂载后手动 `rehydrate()`，`hydrated` 标记之前阻断业务渲染，
  避免 SSR/CSR 内容闪变；
- 备份：全量导出 JSON（词库 + 设置 + 数据源），可恢复；单库可导出标准文档再导入。

## 备选与取舍

- **localStorage**：容量不足（词库 + 词条很快超过 5MB）；
- **OPFS / File System Access**：能力更强但兼容面窄、复杂度高；列为 M3 备选；
- **IndexedDB via Dexie**：功能更全，但仅需 KV 场景，`idb-keyval` 足够且更轻。

## 影响

- 数据迁移通过 `persist` 的 `version/migrate` 管理；
- 大词库导入前 UI 需提示内存占用（已在设置页提示）；
- 未来引入 Worker 做超大数据测量/解析时，不改变存储边界。
