# 安卓端实现路径 · 定稿（2026-10）

> 档位：**实施定稿**。面向在另一台「安卓开发机」上接手的 Agent：拉取本仓库后，以本文为准执行；
> 与 `PLAN-2026-10.md` §7（路线调研）配套，决策已由产品方拍板（见 §1）。
> 网页端与移动 web 的日常维护在开发机 A（无安卓工具链）；安卓工程在开发机 B（有 JDK/SDK/Studio），两边以 Git 仓库为唯一交接面。

---

## 1. 已拍板决策（2026-10 · 产品方确认）

| 决策点 | 结论 |
| --- | --- |
| 首发渠道 | **仅 GitHub Releases APK**（免商店；Play 留作后续可选项） |
| 更新策略 | **热更新优先**：自托管 OTA（更新清单与包挂在本项目已有的 GitHub Pages 上，不接任何第三方服务账号） |
| APP 信息架构 | 底栏五格：**首页 / 词库 / 学习 / AI / 我的**（详见 §4） |
| 影响范围 | **桌面 web 保持现状**；新 IA 应用于 **APP + 移动 web**（两者同构，减少双形态心智） |

---

## 2. 总路线（一段话）

Web 静态导出是唯一真源 → 用 **Capacitor 8 壳**把 `out/` 原样装入 WebView（Android 平台工程提交进仓库）→
**GitHub Actions 出签名 APK** 挂到 GitHub Release（开发机 B 不需要本地跑完整打包链，本机也没有工具链）→
网页层更新走**自托管 OTA**（`@capgo/capacitor-updater` 自托管模式：清单 + zip 挂 Pages），壳层大改才发新 APK →
后续视需要再评估 iOS（需 Mac）与 Play。`out/` 同时继续服务网页版部署，两份产物、一份源码。

---

## 3. 工程事实与陷阱（本仓库已实测/踩过，必须遵守）

1. **basePath 双构建（关键陷阱）**：Pages 构建固定 `NEXT_PUBLIC_BASE_PATH=/wulonvocab`；壳内从 `https://localhost/` 根加载，
   **必须空 basePath**。因此新增 `npm run build:app`（`WV_APP=1`，静态导出、无 basePath），供 `cap sync` 使用；
   `assetPath()`（`src/lib/paths.ts`）与 `layout.tsx` 的字体 `<link>` 均已走该变量，双构建自动兼容。**禁止**把 Pages 产物直接塞进壳。
2. **无本地工具链（开发机 A）**：本机只有 Node；不要在这里尝试装 JDK/SDK。APK 一律 CI 出（ubuntu runner 自带 Android SDK）。
3. **签名 keystore（一次性）**：release APK 必须同一 keystore 才能覆盖升级安装。Bootstrap：在开发机 B（有 JDK）用
   `keytool -genkeypair` 生成 `release.keystore` → base64 后存入本仓库 GitHub Actions secrets：
   `ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`。
   **keystore 绝不入库、绝不丢失**（丢了就只能换签名让用户卸载重装）。
4. **IndexedDB origin 独立**：壳内 origin 为 `https://localhost`，与网页版（`incoruptus.github.io`）存储互相独立；
   两端数据靠既有跨端同步桥接，不做存储迁移。
5. **数据安全**：App 数据随安装保留、跨版本更新保留；**卸载即丢失** → 关于页已强调备份与同步，壳内首启引导里再点一次。
6. **Android 15 强制 edge-to-edge**：安全区（`env(safe-area-inset-*)`）与状态栏处理是硬要求，见 §5 纵向预算。
7. **Gradle 网络（仅开发机 B 本地打包时）**：`dl.google.com` / `maven.google.com` 走该机代理；
   CI 无需代理。
8. **后端映射（Capacitor 特有）**：`navigator.share` 用 `@capacitor/share` 增强；文件保存用 `@capacitor/filesystem`；
   系统 TTS 在 Android WebView 上可用 `speechSynthesis`（保留 Web 实现，插件仅作兜底）；振动已有 Web 实现。
9. **运行时识别（单一构建自适应 IA）**：`Capacitor.isNativePlatform()`（壳内注入 `window.Capacitor`）。
   实现 `useIsAppShell()`（含调试开关：`localStorage["wv-app-preview"]="1"` 让网页也能预览 APP 形态）；
   由 Providers 把 `data-app="1"` 写到 `<html>`，全局样式与导航据此分支。**禁止**用 UA 嗅探。
10. **返回键**：`@capacitor/app` 的 `backButton` → 优先 `history.back()`；根页面再按一次才退（toast 提示"再按一次退出"）。
11. **CI 现有流水线**：`.github/workflows/deploy-pages.yml`（push main 即部署）；安卓加**独立** workflow，别动现有部署。

---

## 4. 信息架构定稿（APP + 移动 web 同构）

### 4.1 五格底栏

| 位置 | 名称 | 路由 | 说明 |
| --- | --- | --- | --- |
| 1 | 首页 | `/dashboard`（新） | 仪表盘：一屏看清"今天学什么 + 词库状态 + 同步状态" |
| 2 | 词库 | `/books` | 现词库页 **+ 导入并入**（导入不再有独立入口）；接收系统"分享文件到应用" |
| 3 | 学习 | `/learn` | 现状保留（学习中心） |
| 4 | AI | `/ai`（新） | 词库管家（内嵌对话）+ 生成词库，双 Tab |
| 5 | 我的 | `/me`（新） | 资料/签名卡 + 功能入口；**设置降为二级**（`/settings` 保留路由） |

### 4.2 各页规格

**① 仪表盘 `/dashboard`**
- 顶部：随意但固定结构的问候区（日期 + "今天" 状态一句话；不做大 Hero）。
- 卡 1「今天」：待复习数 / 新词剩余 / 大按钮「开始学习」（直达 `/study?id=<lastBook>`；无词库时按钮变「建第一个词库」）。
- 卡 2「词库速览」：最近使用的 2-3 个词库（名称 + 进度条 + 到期角标），"查看全部"→ `/books`。
- 卡 3「同步」：状态徽标 + 上次同步时间 + 一键「立即同步」（复用 engine 状态订阅）；未配置时一行引导 → `/me`。
- 卡 4「快捷」：新建词库 / 导入词表（打开词库页导入 Sheet）/ AI 生词库（→ `/ai?tab=generate`）。
- 数据来源：`computeHubMetrics(books, now)`（`src/lib/study/metrics.ts`）现成可用。

**② 词库 `/books`（+ 导入并入）**
- 现页面结构保留；页头增加「导入」按钮 → 打开 **导入 Sheet**（全屏 Dialog/抽屉）：
  三 Tab = 粘贴单词 / 文档与图片 / JSON 文件（**复用** `TextImportPanel`、`DocImportPanel`、`ImportDialog` 的既有逻辑，
  仅换宿主容器，不重写管线）。
- 空状态：主 CTA「新建词库」+ 次 CTA「导入词表」+ 示例。
- **Android 分享意图**（壳内）：`send-intent` 类插件接收文件 → 深链 `/books?import=1&name=...` → 自动打开导入 Sheet 并填入文件。
  （插件定名以实施时官方/社区仓库为准；接收 → 复用同一导入管线。）

**③ 学习 `/learn`**：不动。会话 `/study` 的子页头部已有自己的设置/帮助，不套新顶栏。

**④ AI `/ai`（新父页）**
- 顶部：词库选择器（Combobox，默认 `lastBookId`；持久本次选择）。
- Tab A「词库管家」：把 `AgentPanel` 拆出内嵌视图 `AgentChat`（现状是 Dialog，拆分后 Dialog 仅作壳；
  逻辑/流式/持久化原样复用），全屏对话。
- Tab B「生成词库」：复用 `AiGeneratePanel`（生成完成后直达新词库工作区）。
- **Skill 页 APP/移动端隐藏**：桌面保留；移动 IA 不设入口（需要时在「我的 → 关于」放外链到线上 skill 页）。

**⑤ 我的 `/me`（新父页）**
- 资料卡：@incoruptus · 因为相信，所以看见。（与关于页署名一致）＋ 当前词库数量/词条数轻统计。
- 功能列表（每条一行，右箭头）：
  外观（主题/强调色快捷进入 `/settings#appearance`）· 备份与恢复（`/settings#backup`）· 跨端同步（`/settings#sync`）·
  词典数据源（`/settings#sources`）· 本地词库缓存（`/settings#dicts`）· AI 规范（外链线上 skill）· 关于（含鸣谢弹窗入口）。
- **`/settings` 保留为二级页**：原内容不动，仅从 `/me` 进入（移动 IA 中不在底栏）。

### 4.3 路由与导航矩阵

| 路由 | 桌面 web | 移动 web | APP |
| --- | --- | --- | --- |
| `/dashboard` `/ai` `/me` | 可访问（无强入口，保持现状导航） | 底栏父页 | 底栏父页 |
| `/books` `/learn` | 现状 | 父页（含导入 Sheet） | 父页（含导入 + 分享意图） |
| `/import` | 保留（文档/深链） | 入口合并进词库；深链仍可访问 | 同移动 web（隐藏入口） |
| `/skill` | 保留 | 隐藏入口 | 隐藏入口 |
| `/settings` `/book` `/study` `/book/export` | 现状 | 二级/子页 | 二级/子页 |

---

## 5. 顶栏双层重构（移动 IA）与纵向预算

### 5.1 组件拆分
- `TopNav`（桌面 + 网页移动）**保持现状**；从其中抽出 `BrandMark` 供复用。
- 新增 `MiniTopBar`（移动 IA 子页用）：**无 LOGO/品牌**，仅：可选返回 + 页面语境（右对齐动作组，如导出/管家/搜索）。
- 父页（五格页）在移动 IA **完全不渲染顶栏**；页内自带标题承担语境（如词库页大标题）。

### 5.2 存量动作迁移（从 TopNav 的右侧动作区逐一核对，实施时以真实代码梳理出最终清单）
| 现状动作 | 去向 |
| --- | --- |
| 主题切换 | 「我的 → 外观」（移动 IA 不再常驻） |
| GitHub / 在线版链接 | 「我的 → 关于」（网页版保留现有页脚） |
| 工作区类动作（AI 管家/导出/搜索） | 留在各子页自身头部或 `MiniTopBar` 动作组 |
| 学习会话的设置/帮助 | 已在会话页内部，不动 |

### 5.3 纵向预算（移动 IA 数值约定）
| 区域 | 数值 |
| --- | --- |
| 状态栏 | `env(safe-area-inset-top)`（edge-to-edge；StatusBar 插件设 overlay） |
| 父页顶栏 | **0** |
| 子页 MiniTopBar | 44px（compact，含返回） |
| 底栏 | 56px + `env(safe-area-inset-bottom)` |
| 内容底部预留 | 统一 CSS 变量 `--app-bottom: calc(56px + env(safe-area-inset-bottom) + 12px)`，页面不再各写 pb-24 |
| 习惯 | 触控目标 ≥ 44px；子页返回在左；滑动返回交由系统 |

---

## 6. 实施阶段（每阶段独立可验证、可交付）

**P1 · 运行时与导航骨架（纯 web 改动，开发机 A 可完成）**
1. `useIsAppShell()` + `data-app` + `wv-app-preview` 调试开关；
2. 新路由骨架：`/dashboard` `/ai` `/me`（先放结构与既有组件嫁接）；
3. `MobileTabBar` 换五格；父页隐藏 TopNav / 子页 `MiniTopBar`（移动 IA）；
4. 纵向预算变量化；
5. Verify：typecheck/lint/test/e2e + 390×844 九页巡检（参照本仓库既有移动端巡检流程）。

**P2 · IA 内容落地（纯 web）**
1. 仪表盘四卡；2. 词库页导入 Sheet（三 Tab 复用）；3. AI 页（AgentChat 拆分 + 生成 Tab + 词库选择器）；4. 我的页与 `/settings` 二级化 + 锚点滚动；
5. Verify 同上。

**P3 · Capacitor 工程与 CI 产物（开发机 B 为主）**
1. `build:app` 脚本（无 basePath）与 `app:sync` / `app:apk`；2. `@capacitor/*` 依赖 + `npx cap add android`，`android/` 提交；
3. 图标/启动屏（`@capacitor/assets`）；4. `android-release.yml`：手动/Release 触发 → 构建签名 APK → 挂到 GitHub Release；
5. keystore bootstrap（§3.3）；6. Verify：真机安装、覆盖升级安装、返回键、安全区、断网启动。

**P4 · OTA 与系统整合（开发机 B + CI）**
1. `@capgo/capacitor-updater`（自托管）：CI 生成 `app-update.json`（version/url/sha256/minShellVersion）与 `<version>.zip` →
   部署进 Pages 的 `/app/`；App 端 updateUrl 指向 `https://incoruptus.github.io/wulonvocab/app/app-update.json`；
   校验 sha256；`notifyAppReady` + 失败保留旧包；2. 分享意图导入；3. StatusBar 配色随主题；
4. Verify：发一次 OTA 演示（旧包 → 检测 → 下载 → 重启生效）。

---

## 7. 风险与备选

| 风险 | 对策 |
| --- | --- |
| OTA 插件阻断 | 退回"重装 APK"节奏（CI 产物链已具备）；OTA 不是首发的硬前置 |
| remote-URL 壳（备选，不采用） | 每次启动远端加载 → 离线首启不可靠，且原生桥注入复杂；**弃** |
| 国产 ROM WebView 差异 | 目标 Android 8+；实施时在 2-3 台真机走一遍 P3 验收清单 |
| keystore 丢失 | §3.3 流程 + 本地多处备份；丢失应对 = 换签名、用户重装 |
| 分享意图插件不成熟 | 降级：手动"导入 Sheet"路径始终可用（分享只是加速器） |

---

## 8. 验收标准（首个 GitHub Release）

- [ ] Release 附**签名 APK**（安装即用；覆盖升级安装成功）
- [ ] 五格 IA 与顶栏规则生效（父页无顶栏、子页无 LOGO）、390×844 与真机纵向预算正确
- [ ] 词库页导入 Sheet 三路可用；分享文件到应用可直达导入
- [ ] AI 页：管家对话（流式/持久化）与生成词库可用；`/skill` `/import` 在移动 IA 无入口
- [ ] 返回键语义正确（页内返回→根页二次退出）
- [ ] OTA：线上发一版网页包，App 内检测并生效（或按 §7 退回重装节奏并记录原因）
