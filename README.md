# WulonVocab · 乌龙单词

> 来自 Caddy Wulon · 乌龙罐

本地优先的词库工坊：把散落的词收进一个地方，字段随你组合，复习自有节奏，排好版打印出来，就是一本属于自己的书。

[在线版](https://incoruptus.github.io/wulonvocab/) · [项目主页](https://github.com/incoruptus/wulonvocab) · [作者](https://github.com/incoruptus)

---

## 这是什么

你攒下的词，值得被认真对待。WulonVocab 在浏览器里工作：词库、字段、学习进度默认都存在本机，开启跨端同步后可以在手机与电脑之间自动对齐。没有账号体系；只有当你在设置里主动启用在线词典、AI 或跨端同步时，才会发生联网。

## 功能一览

**词库与字段**
- 动态字段：音标、词性释义、词族、词形变换、搭配、例句、情景标签、词源……十几种字段类型随你增删、排序、配置
- 字段设计器 + 预设模板（牛津词典风 / 极简记忆卡 / 考试冲刺 / 深度阅读）
- 改字段名，老数据自动跟着走；词条级撤销、批量操作、滑动快捷手势（移动端）

**学习（间隔重复）**
- 基于 FSRS 的复习调度；每日新词上限、记忆保持率可调
- 两种模式：翻卡自评、看词选义选择题（键盘 DFJK / WEIO 快捷操作）
- 学习中心：负载建议、7 天预排、13 周热力图、正确率与连续天数

**导入**
- JSON / CSV / TSV / NDJSON 与「单词 → 内容」字典；ECDICT、OALD 等词典导出数据自动对字段
- Word（.docx）与 PDF 文本本机直读；扫描件走视觉模型转写（可取消、可重试/跳过）
- 本机 OCR（tesseract.js，免 AI）；AI 生成词库（描述需求直接产出）；配套 [AI Skill 规范](https://incoruptus.github.io/wulonvocab/skill/) 可交给任何外部 AI

**导出与印刷**
- 四种版式：辞书体（宽页自动双栏）、瑞士极简、笔记手账（含自测笔记带）、闪卡网格
- A4 到 32 开、封面与索引、镜像装订边距、页脚页码；矢量 PDF（文字可搜）与最高 384 DPI 的 PNG

**跨端同步（三种方式，随时切换）**

| 方式 | 适合 | 说明 |
| --- | --- | --- |
| 同步包 | 偶尔换机 | 导出 `.wulonsync` 文件，另一台导入前先看合并预览，零配置 |
| 自动同步 | 日常多端 | 借 GitHub Gist 作中转：配对码加密后再上传，中转站只见密文；打开应用 / 切回前台 / 每 30 分钟自动对账 |
| 扫码直传 | 面对面对齐 | 一台出码、一台扫码，WebRTC 直连互换，不经过任何服务器（信令除外） |

合并规则：一边改取改方；两边都改同一处按较新改动胜（可在合并预览里翻转）；删除留墓碑传播，不会被旧设备复活；学习进度取最近一次复习与每日较大值；明暗模式与强调色是设备本地偏好，不参与同步。

**AI 词库管家**
- 对话式管理词库：查词、增改、批量整理；危险操作两段式确认；流式输出；会话按词库保存

**数据**
- JSON 备份导出 / 恢复；同步前自动留存安全快照；随时一键清空

## 快速开始

要求 Node ≥ 20.9。

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # 生产构建
```

校验与测试：

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm test             # Vitest（157+ 单测）
npm run check:encoding
npm run e2e:sync     # 双设备同步 E2E（需先起 dev server）
```

GitHub Pages 静态导出（子路径 `/wulonvocab`）：

```bash
npm run build:pages  # 输出 out/
npm run serve:pages  # 本地预览 http://localhost:4010/wulonvocab/
```

## 目录结构

```
src/
  app/            页面（Next.js App Router，静态导出用查询串传参）
  components/     UI 组件（app / book / export / import / learn / study / sync / ai / ui）
  lib/            纯领域层（types / sections / importer / store / study / export / sync / ai / lookup）
  lib/sync/       跨端同步：合并引擎、加密封装、传输（Gist / PeerJS / 文件）
skill/            AI Skill 唯一真源（改后跑 npm run sync:skill）
docs/            规划、研究与架构决策记录
scripts/         构建、字体/PDF 资源同步、E2E
```

工程约定（必读）：[`AGENTS.md`](./AGENTS.md)（含同步触发点清单、文案风格、控件规范与红线）。

## 技术栈与鸣谢

平台 Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Geist；组件 Radix UI · lucide · sonner · dnd-kit；状态 Zustand · idb-keyval · zod；学习引擎 ts-fsrs（FSRS）；解析 mammoth · pdf.js · PapaParse · JSZip；导出 jsPDF · html-to-image；图像 heic-to · tesseract.js；同步 PeerJS · GitHub Gist API；字体 Geist（OFL）· 思源宋体（OFL）· HarmonyOS Sans SC（华为免费商用许可）；词典数据 ECDICT（MIT）。

应用内「关于 → 鸣谢与技术栈」有完整列表与许可标注。内置示例与文档内容均为自撰，不含受版权保护的词典原文。

## 许可

仓库暂未声明开源许可（默认保留所有权利）。第三方依赖与资源遵循各自许可，详见鸣谢列表。
