# 「真混淆」干扰项 · 调研与设计（2026-10）

> 来源：调研子代理报告（仅调研，无代码改动；行号以 2026-10-11 工作树为准）。
> 标注约定：**【实】**=仓库代码/文档或已核实来源；**【推】**=推断，待产品方核实。
> 结论仅作设计输入，**未开启实施**（产品方要求：调研定稿后再动手）。

## 结论摘要

1. 【实】证据方向明确：易混干扰项是「合意困难」的正确形态（辨别学习、检索竞争），但必须配答错后的差异反馈，否则有「错项被当真」的负向建议效应；干扰项应取语义/形式空间中的「最近邻」而非随机。
2. 【实】业界没有可直接复用的通用易混干扰项源：Anki 核心无选择题（插件用同牌组随机抽）、Quizlet 用同学习集其它词条、Duolingo 课程人工编写；OALD/Wiktionary 有面向人类的易混词表但许可/中文覆盖不足。候选引擎必须自研。
3. 【实】面向本仓库最优路径：分层候选流水线 = 离线资源启发式（纯函数、默认开启）+ 用户手工确认（随同步）+ 可选 AI 预生成（缓存）+ 错题个性化（本机）；无 AI 时前两层仍完整可用，随机逻辑保留为兜底，不足 3 项仍回退翻卡。
4. 【实】数据模型首选 Entry 顶层可选字段 `quiz.confusables`（同书词条 id + 可选义项 id），经既有 Entry LWW 同步（需把该字段加入合并材料哈希）；AI 候选缓存与错题图放独立本机 IDB，不进同步载荷。
5. 【推】工作量：MVP（启发式+手工+UX+测试）约 8–11 人日；AI 预生成层 +4–6；错题个性化 +2–3。主要风险是中文释义重叠的判定质量与「两选项都对」的边界。

## 1. 学术证据

| # | 来源（已核实 DOI） | 结论 | 启示 |
|---|---|---|---|
| 1 | Anderson, Bjork & Bjork 1994, *JEP:LMC* 20(5):1063–1087 | 检索某类别部分成员会抑制同类其它成员（retrieval-induced forgetting） | 强语义场竞品并置会互相干扰；既要利用竞争强化辨别，也要让组内成员都被复习到 |
| 2 | Laufer 1988, *Language and Education* 2(2):113–132（synforms） | 二语词汇错误的主类是「形式相似词」（后缀/拼写/语音相似） | 干扰项必须同时有「形近」通道，不能只做「义近」 |
| 3 | Ramscar & Yarlett 2007, *Cognitive Science* 31(6)（discriminative learning） | 学习=在竞争线索间建立区分；错误来自无法区分相近词 | 理想干扰项=该词在语义/形式空间的最近邻；易混对宜互为对方干扰项 |
| 4 | Roediger & Marsh 2005, *JEP:LMC* 31(5):1155；Butler & Roediger 2008, *Memory & Cognition* 36(3):604 | 多选题错选项可能被当作真；即时反馈增强正向、抵消负向 | 答错后必须给「为何不是它」的辨析反馈；校正反馈是易混干扰项的安全前提 |
| 5 | Bjork & Bjork 2011（desirable difficulties） | 适度提高提取难度提升长期保持 | 干扰项「近但不等于」；过近到不可分辨会损伤信任与学习 |

**可操作结论**：① 同词性 + 近义/形近的最近邻优先；② 尽量成对互链；③ 生成期校验「可接受项」并剔除；④ 答错必给差异说明（可模板化）；⑤ 组内成员都要排复习，避免只强化胜者。

## 2. 业界做法

- **Anki**（【公开资料·待复核】）：核心题型为 Basic/Cloze 回忆，无内置四选一；社区 MC 插件普遍从同牌组其它卡片随机抽选项，无个性化易混源。
- **Quizlet**（【公开资料·待复核】）：Learn/Test 从同一学习集的其它词条生成干扰项；质量取决于用户自建集合。
- **Duolingo**（【实】）：练习由贡献者人工编写；个性化在难度与间隔（Settles & Meeder 2016, ACL），不是干扰项生成。
- **百词斩 / 不背单词 / 墨墨**（【推】）：均无公开的「词向量近邻自动干扰项」证据；百词斩依赖人工图像库，不背以真实语料挖空为主，墨墨以自评+算法为主。
- **词典侧易混资源**：OALD curated confusables（版权受限）、Wiktionary 易混词表（CC BY-SA，无中文释义）——仅可作人工参考素材，不能随包（AGENTS 版权红线）。

## 3. 可用资源评估（离线优先）

| 资源 | 离线 | 体积（约） | 许可 | 结论 |
|---|---|---|---|---|
| ECDICT 裁剪内置 | 是 | 2.1MB gz/23k、4.1MB gz/57k | MIT | **启发式底座** |
| 中文释义 gloss 重叠（自算） | 是 | 0 | 自有 | **主信号**：按 `；，、` 切 gloss + 字符 bigram，免分词器 |
| 词形相近（编辑距离/词缀/词根） | 是 | 0 | 自有 | **第二信号**，与释义加权组合 |
| 标签共现 | 是 | 0 | MIT | 兜底加权，不作主信号 |
| WordNet / OEWN | 是 | ~30MB（裁剪可至数 MB） | Princeton 宽松类 | 后续增强，不进 MVP |
| fastText / GloVe 词向量 | 是 | 全量 >4GB；仅内置词表 int8 约 2–7MB | 各有约束 | **长期内置「混淆包」候选**，MVP 不必 |
| MUSE 双语向量 | 是 | >1GB | 学术许可 | 放弃 |
| 用户导入词典翻译重叠 | 是 | 用户数据 | 仅本机 | 可选增强源 |
| 用户错题行为 | 是 | 0 | 本机 | 个性化层（冷启动差） |

【实】现状无逐题错选日志：`applyReview` 只更新 SRS 与 daily 聚合；错题图需独立 IDB 表。

## 4. 生成形式对比

| 方案 | 质量 | 成本/延迟 | 隐私 | 离线 | 同步影响 | 判断 |
|---|---|---|---|---|---|---|
| a 手工易混关系 | 高 | 人力；答题 0 延迟 | 最好 | 是 | 存 Entry 顶层，随 LWW 传播 | **推荐**（高价值小规模） |
| b AI 预生成（批量） | 中高 | 每词 1 次调用 | 词条发往用户自配端点 | 用是/生成否 | 存 Entry 则同步；缓存则不同步 | **推荐为可选层** |
| c 学习时 AI 实时生成 | 高 | 每题材数秒+费用 | 同上 | 否 | 无 | **默认否决**：破坏题目确定性与离线承诺；仅保留反馈态按需「生成辨析」 |
| d 资源启发式 | 中 | 0 | 最好 | 是 | 0 | **默认底座** |
| e 错题个性化 | 高 | 0 | 最好（本机） | 是 | 默认不同步 | **第二层** |
| f 组合分层（d 底座 + a 确认 + b 可选 + e 个性化） | — | — | — | — | — | **最终形态** |

## 5. 数据模型提案（主提案）

```ts
// src/lib/types.ts：Entry 顶层可选字段（参照 srs 先例）
export interface ConfusableRef {
  entryId: string;   // 同书词条 id
  senseId?: string;  // 具体义项（缺省=取最相似义项）
  source: "manual" | "ai" | "auto" | "wrong"; // 来源徽标
  at: number;
}
interface Entry {
  /** 易混词关系（学习辅助；不渲染进导出卡片） */
  quiz?: { confusables?: ConfusableRef[] };
}
```

- 写路径：新 store action `setEntryConfusables(bookId, entryId, refs)`（bump `updatedAt`，保证同步传播）。
- 合并：`entryMaterialHash` 增加 `quiz`（一行）；并发仍整条 LWW（一侧新增可能被另一侧覆盖，记为已知限制）。
- 删除容忍：被引词条墓碑删除后 id 悬空，读取侧忽略，不做级联清理。
- 体积：每 ref 60–90B；5% 词条×3 条 ≈ 原始 0.3–0.5MB、gzip 0.1–0.2MB。
- **候选缓存（本机 IDB）**：key=`${bookId}:${entryId}:${modelFingerprint}`；不入 store/载荷；指纹变化即失效。
- **错题图（本机 IDB）**：`(bookId,entryId,chosenEntryId) -> {n,lastAt}`；若未来要跨端个性化再升级为同步独立 slice（v1 不推荐）。

备选：`values["_confusables"]`（编辑器噪声、会被文件导出带走）；仅本机表（换机丢失）；Book 级映射（改动面最大）。

## 6. UX 提案

- 入口：学习首页「干扰项来源」三段：随机（现状）/ 智能（离线易混，默认）/ 真混淆（易混+个性化）。【注：三段式是否保留"随机"由产品定】
- 来源徽标：选项行内小字「近义/形近/手工/错题/AI」；遵守文案规范（不用破折号、不堆口号）。
- AI 候选确认：编辑器「易混词候选」面板（接受→写入、驳回记本机抑制表）；批量生成入口挂导入完成后。
- 手工标注：多选→标记易混组（组内两两互链）；编辑器检索多选；**答错反馈态的「这对我易混」一键互链**（最低摩擦入口）。
- 判定宽容：反馈态次按钮「另一个也对」→ 本机 override；评分保持确定性（答错=Again）。

## 7. 边界情况

- 同形异义（bank）：题面给搭配/例句锁定义项，或接受任一义项命中（需拍板）。
- 悬空/跨书引用：仅同书；落空忽略；文件导入无该字段降级启发式。
- 答案唯一性：词性一致 → 相等/包含过滤 → gloss Jaccard（【推】≥0.6 剔除）→ 人工例外标「可接受」。
- 性能：候选池分桶（同 pos、长度带、首字母/词根）或 Worker 化；MVP 先分桶。

## 8. 推荐架构（数据流）与降级

```text
候选流水线（运行时纯函数，src/lib/study/）
  1) entry.quiz.confusables（手工/AI 已确认）      最高
  2) 个人错题图命中（本机）                        次高
  3) AI 候选缓存（本机）                           中
  4) 离线启发式: gloss 重叠(同 pos) → 形近 → 同 tag/synonym; 加权+去重+多样性
  5) 兜底: 现状随机逻辑（quiz.ts 原样保留）
  候选 < 3 → 翻卡（现状回退不变）
      ↓
buildQuizOptionsV2(...) → 选项 + 来源徽标 → 判定/评分/撤销路径不变
写侧: 反馈态「这对我易混」/ 编辑器面板 / 批量 AI 确认 → store action → updatedAt bump → 既有同步触发点带走
```

降级矩阵：无 AI=1/2/4/5；无历史=1/3/4/5；词太少=4/5→翻卡；启发式异常=5。

## 9. 复杂度与风险

| 项 | 人日【推】 |
|---|---|
| 数据模型 + store action + merge 哈希 + serializers 决策 + 测试 | 1.5–2 |
| 启发式候选引擎 + 单测 + 性能分桶 | 3–4 |
| quiz.ts 可插拔重构（保持旧测试绿） | 1–1.5 |
| UX（设置、徽标、AI 确认、手工入口、申诉） | 2–3 |
| 文档/Skill/AGENTS 走查 | 0.5 |
| **MVP 合计** | **8–11** |
| AI 预生成层 | +4–6 |
| 错题个性化 | +2–3 |
| 内置混淆包（可选） | +2–4 |

风险（高→低）：干扰项质量验收（需评估集+人工抽查）；双正确答案损伤信任；Entry 整条 LWW 粒度；许可；包体带宽；误伤学习会话既有约定。

## 10. 开放问题（需产品方拍板）

1. `confusables` 是否随同步（报告默认是）；错题图是否同步（默认否）。
2. 同形异义题是否接受任一义项为正确。
3. 干扰项是否允许来自未学过的词（建议默认否，可配置）。
4. AI 预生成触发面与成本上限。
5. 「另一个也对」的评分语义（维持 Again vs 记 Hard）。
6. 是否需要跨词库易混（默认仅同书）。
7. 来源徽标默认可见度。
8. MVP 是否随包发布「内置混淆包」。

## 11. 来源清单

- Anderson, Bjork & Bjork 1994 — https://doi.org/10.1037/0278-7393.20.5.1063
- Laufer 1988 — https://doi.org/10.1080/09500788809541228
- Ramscar & Yarlett 2007 — https://doi.org/10.1080/03640210701703576
- Roediger & Marsh 2005 — https://doi.org/10.1037/0278-7393.31.5.1155
- Butler & Roediger 2008 — https://doi.org/10.3758/MC.36.3.604
- Settles & Meeder 2016 (ACL) — https://doi.org/10.18653/v1/P16-1174
- Anki Manual — https://docs.ankiweb.net/
- Quizlet Help — https://help.quizlet.com/
- Oxford Learner's Dictionaries（confusables，版权受限）
- Wiktionary Appendix: Commonly confused words（CC BY-SA）
- ECDICT — https://github.com/skywind3000/ECDICT（MIT）
- Open English WordNet — https://github.com/globalwordnet/english-wordnet
- Princeton WordNet License — https://wordnet.princeton.edu/license-and-commercial-use
- GloVe — https://nlp.stanford.edu/projects/glove/
- fastText Crawl Vectors — https://fasttext.cc/docs/en/crawl-vectors.html
