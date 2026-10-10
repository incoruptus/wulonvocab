# 调研报告（摘要）

> 完整调研于 2026-10 在线进行，以下为影响架构决策的关键结论与来源。

## A. Geist 设计系统（vercel.com/geist）

**关键发现**

1. 官方**公开发布**的只有 `geist` 字体包（GeistSans / GeistMono，自托管，`geist/font/*`）；
   官方组件库源码包（文档中引用的 `@vercel/geistcn`）未发布到 npm（registry 404）。
   → 结论：字体直接用官方包；组件按其文档规范 + 实测令牌忠实复刻。
2. 设计令牌（实测值，已固化到 `src/app/globals.css`）：
   - 两级背景 `#fff/#fafafa`（暗色 `#0a0a0a/#000`）；10 级灰度（背景→文本：100→1000）；
   - 语义色各 10 级：蓝=信息、绿=健康、琥珀=警示、红=错误；
   - 圆角：控件 6px、菜单/弹窗 12px、全屏 16px、徽章胶囊形；
   - 阴影半透明（`0 0 0 1px #00000014` + 少量投影）；动效 `.2s`（浮层）/.3s（遮罩）+
     `cubic-bezier(.175,.885,.32,1.1)`；
   - 字号系统：heading（600，负字距）/ label / copy / button 四族，等宽用于键位与代码。
3. 焦点环用「2px 背景色 + 2px 强调色」双层 ring；边框只画一次（避免叠加 alpha 边框）。

**落地**：`globals.css` 定义完整 `--ds-*` 令牌（明/暗双套）→ `@theme inline` 映射为 Tailwind 工具类；
组件原语在 `src/components/ui/`（Button/Input/Dialog/…）。暗色主题通过 `.dark` 类切换，预水合阶段用内联脚本防闪。

## B. 打印级 PDF / PNG 导出

**关键结论（决定实现路线）**

1. **矢量 PDF**：Chrome「打印 → 另存为 PDF」保留矢量文字并自动嵌入字体子集；
   通过**隐藏 iframe 克隆**（复制全部样式表 + 动态注入字面 mm 的 `@page`）实现样式隔离，
   比全局 `@media print` 隐藏 UI 更可靠（react-to-print 同思路）。
2. **PNG**：`html-to-image`（foreignObject 光栅化）排版保真优于 html2canvas（后者不支持
   box-shadow/object-fit/filter 等）；`pixelRatio ≥ 3.125` 即达 300 DPI（DPI = 96 × ratio）；
   `getFontEmbedCSS()` 只算一次并复用到所有页。
3. **中文**：系统字体（微软雅黑/苹方/宋体）在 Chrome 打印 PDF 中会被正确嵌入子集，
   无需随包携带 10–20MB 的 CJK TTF（jsPDF/@react-pdf 方案的痛点）。
4. **确定性分页**：Chrome 无 `@page` margin box（无法用 CSS 生成页码），且 `marks/bleed` 全浏览器不支持
   → 采用「测量 → 贪心装箱 → 渲染固定尺寸页面」方案，页码/页眉由 React 绘制；每页 `break-after: page`。
5. **装订参数**：胶装内侧额外 3–5mm；骑马钉中缝 3mm 且页数为 4 的倍数；双面沿长边翻转 +
   奇偶页镜像边距；常用开本：A4 210×297、A5 148×210、B5 ISO 176×250、JIS B5 182×257、
   正度 16 开 185×260、正度 32 开 130×184。
6. **打印对话框提示**（已内置到应用提示）：边距=None、缩放=100%、背景图形=开、页眉页脚=关。

**来源**：MDN `@page`/`break-inside`/`print-color-adjust`；caniuse css-paged-media；react-to-print
（iframe 管线）；html-to-image 文档；Puppeteer `page.pdf`（备选方案）；Prepressure 纸张尺寸表；
百度百科「图书开本 / 骑马钉」等装订资料。

## C. 词典产品与字段体系

**关键结论（决定字段模型与导入容错）**

1. **Anki 笔记类型**：字段（fields）与模板分离，内容必须按字段切分才能重排；
   → 采用「Schema 驱动渲染」与「未知字段不丢弃」。
2. **ECDICT**（760k 词 CSV）：`translation/definition` 每行一义、`exchange` 交换码
   （p=过去式 d=过去分词 i=现在分词 3=第三人称 r=比较级 t=最高级 s=复数 0/1=原型）、
   `tag` 考纲（zk 中考/gk 高考/cet4/ky 考研…）；**陷阱：`pos` 列是语料占比（n:46/v:54）不是词性**。
   → 已内置专用映射（`importer.ts` 的 `ecDictRowToValues`）。
3. **dictionaryapi.dev**：多词条同一单词（按词性拆分）应合并；phonetics 数组形态不一（空 audio 常见）。
4. **OALD 词条解剖**（学习者词典的黄金结构）：词性分组 → 编号义项（释义 + 句型 + 例句 + 同义指针）
   + 搭配框 + Word Family + 词源 + Idioms。
   → `senses` 字段以 Sign/Sense 模型覆盖：pos / translation / definition / examples / usage /
   patterns / synonyms / antonyms / collocations / notes；词族、词性变换、词源拆为独立字段。
5. **主流背单词产品字段**（欧路/墨墨/不背单词/百词斩）：音标发音、双语释义、词根词缀、派生树（词族）、
   搭配（lexical chunks）、情景/真题例句（contextual learning）、联想助记（personal mnemonics）、
   图片（双编码）；复习调度属系统层，不入字段。
6. **容错归一化**：标量/数组互转、词性分组对象展开、平行数组配对、内联枚举（①②/1.）拆分、
   中英混排按脚本边界切分、HTML/Anki 记号清理、同名单词合并、大小写不敏感键、NFC 与零宽字符清理。
   → 全部实现在 `sections.ts` 的 `normalize*` 与 `importer.ts`，并有单测覆盖。

**来源**：Anki Manual (docs.ankiweb.net)；ECDICT README (skywind3000/ECDICT)；dictionaryapi.dev；
oxfordlearnersdictionaries.com 词条结构；OALD9/Yomitan 相关 GitHub 项目；欧路词典 / 墨墨背单词 /
不背单词 / 百词斩官网与 App Store 页面；dual-coding、lexical approach 等学习科学条目。

## D. 我方落地的工程取舍

| 决策 | 取舍 |
| --- | --- |
| 组件自带渲染而非引入组件库 | 忠实 Geist 规范；避免第三方库风格漂移 |
| 分页自研（非 paged.js） | 需要与屏幕预览/PNG 完全一致；paged.js 无法满足 iframe 打印与每页像素导出 |
| 图片型 PDF 也提供 | 「打印级质量」与「一键零摩擦」两者兼顾，用户自行选择 |
| 本地词典存 IndexedDB 行数据 | 数十万级词条可离线检索；避免主状态膨胀 |
| AI 适配器按 Schema 动态出题 | 换字段表即可换输出结构，与导入归一化共用一条管线 |
