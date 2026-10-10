# ADR-0001：Next.js App Router + 全客户端渲染

日期：2026-10-10 · 状态：已采纳

## 背景

WulonVocab 是本地优先的单机应用：数据在浏览器 IndexedDB，无后端。需要现代工程链（TypeScript、
热更新、路由、构建优化），同时未来可能需要在局域网/静态托管分发。

## 决策

使用 **Next.js 16（App Router + Turbopack）**，但所有业务逻辑运行在客户端组件中；
动态路由页面（`/book/[id]`）采用「服务端 Suspense 壳 + 客户端组件」结构以兼容
Next 16 的 Cache Components 预渲染约束（`useParams` 等动态 Hook 必须可流式到达）。

## 备选与取舍

- **Vite + React SPA**：更简单，但没有文件路由/未来 SSR 弹性，且团队更熟悉 Next 工程实践；
- **Next 服务端渲染数据层**：违背本地优先原则（数据在用户设备），弃用。

## 影响

- 页面文件保持极薄；禁止在服务端组件访问业务 store；
- 预渲染阶段不能调用不稳定 API（`Date.now`/`crypto.randomUUID`），相关调用一律延后到事件处理器；
- 构建（`next build`）是 CI 的最低门槛。
