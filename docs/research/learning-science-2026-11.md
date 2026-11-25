# WulonVocab（乌龙单词）学习科学调研报告

**调研范围**：新词初学与复习的机制差异、自评式闪卡的有效性、掌握状态粒度、分组与顺序、目标与连续天数。
**方法**：检索一手论文、元分析与官方文档，用 Crossref 核验 DOI；产品观察只作佐证，不当作证据。
**标记约定**：**[事实]** 有论文或官方文档直接支持；**[推断]** 由机制、公式或数据结构推导，无直接实验；**[建议]** 产品决策建议。
**局限**：部分期刊全文付费，引用的是摘要或公开综述；效应量来自二语学习者样本，不能直接等价到中文母语者使用单词 App 的场景；未做产品数据实证。

---

## 0. 结论速览

1. 「知道 / 不知道」闪卡测到的主要是**熟悉感**，不是**可提取性**。它不能直接当作 FSRS 的四档评分；第一次有效评分应来自「看词说义」的回忆验证。
2. FSRS 只建模「评分之后的记忆状态」，不建模「第一次是怎么学会的」。初学需要独立的短步骤（10–30 分钟 → 1 天），毕业后交给 FSRS。
3. 三态对**调度**够用，对**用户表达**不够。「已掌握」把「记得」和「会用」混为一谈；建议拆成「记忆强度」与「掌握层次」两个维度。
4. 连续掌握度建议直接显示 **R(30)**（30 天后回忆概率），不要自造 0–100 分。它可解释、会衰减、与调度一致。
5. 字母序只适合做**索引**，不适合做**学习顺序**；语义标签组是干扰最强的分组方式，只适合复习辨析；主题 / 情景组可用于初学。
6. 以「词」为材料时，元分析显示**块状优于交错**（g = −0.39）。「交错更高级」不能当默认理由；初学块状、复习交错。
7. 每日目标环符合目标设定理论与目标梯度，但二值打卡 + 断签惩罚会放大「破罐破摔」。需要三档目标 + 宽恕 + 周达标备用轨道。
8. 凌晨 4 点日界**没有直接科学依据**，是基于作息的工程约定；应本地化、可配置，并明确它是「学习日」而非自然日。

---

## 1. 新词初学与复习：机制不同，调度也应不同

### 1.1 认知机制差异

复习是**提取**一个已存在的痕迹；初学是**建立**痕迹，瓶颈在注意、加工深度与形—义绑定，而不在提取时机。Nation 把「认识一个词」拆成 form（形式）、meaning（意义）、use（使用）三个层面，每层又分接受性（receptive）与产出性（productive）[Nation 2007, DOI 10.2167/illt039.0; 系统展开见 Nation 2013]。Schmitt 进一步强调，词汇知识是**渐进的、部分的、多维的**，不是「会 / 不会」的二元开关 [Schmitt 2008, DOI 10.1177/1362168808089921]。

这带来一个直接后果：**初学的目标不是「这次答对」，而是「建立一条能被再次提取的路径」**。因此初学阶段更依赖：带反馈的成功提取、多个语境、以及睡眠后的巩固 [Rasch & Born 2013, DOI 10.1152/physrev.00032.2012]。复习阶段才更依赖「在即将遗忘时提取」的间隔安排 [Cepeda et al. 2006, DOI 10.1037/0033-2909.132.3.354]。

### 1.2 需要几次暴露

先给结论：**不存在可照搬的统一阈值**，而且「自然输入中的接触次数」与「刻意闪卡中的成功提取次数」不是同一种计量单位。

- **[事实]** Uchihara、Webb 与 Yanagisawa 的元分析汇总 26 项研究、45 个效应量、N = 1,918，发现接触次数与附带词汇学习的平均相关为 **r = .34（中等效应）**；且效应受间隔学习、视觉支持、投入度、接触次数跨度等因素调节 [Uchihara et al. 2019, DOI 10.1111/lang.12343]。
- **[事实]** 接触次数与任务性质存在交互：单纯增加出现次数收益有限，任务是否要求检索、是否需要产出，会显著改变结果 [Laufer & Rozovski-Roitblat 2011, DOI 10.1177/1362168811412019]。
- **[事实]** 附带学习的元分析也显示，整体收益存在但幅度有限，且高度依赖任务与接触条件 [Webb, Uchihara & Yanagisawa 2023, DOI 10.1017/S0261444822000507]。
- **[事实]** Webb 在受控语境中操纵重复次数，发现重复对多个词知识维度都有正向作用，但不同维度的增长曲线不同，产出性知识通常更慢 [Webb 2007, DOI 10.1093/applin/aml048]。

**可操作区间**（[建议]，依据强度：中）：

| 目标 | 需要的成功证据 | 说明 |
|---|---|---|
| 形—义再认（看词选义） | 2–3 次，跨 ≥2 个间隔 | 再认门槛最低，最容易「假会」 |
| 自由回忆（看词说义） | 3–5 次成功提取，跨 ≥3 个间隔 | 测试效应 + 间隔效应 |
| 产出（中→英、造句） | 在回忆之上再加 2–3 次产出练习 | 需要独立的产出证据 |
| 自然阅读 / 听力中的理解 | 约 6–10 次以上有效接触（综述常见区间） | 这是附带学习，不是闪卡效率 |

不要把这 6–10 次直接搬到闪卡上：刻意学习（deliberate learning）的单位时间效率远高于附带学习，用自然输入的次数标准设计闪卡，会让新词模式变得冗长而低效 [Nation 2007]。词卡本身是效率最高的形式之一，但效果取决于卡片设计与排程，而不是卡片数量 [Nakata 2011, DOI 10.1080/09588221.2010.520675]。

### 1.3 识别 → 回忆 → 产出的证据链

Laufer 与 Goldstein 把词汇知识分成四个可测等级：主动回忆（active recall）、被动回忆（passive recall）、主动识别（active recognition）、被动识别（passive recognition），并据此设计了四种不同难度的测试，说明它们不能互相替代 [Laufer & Goldstein 2004, DOI 10.1111/j.0023-8333.2004.00260.x]。

**[事实]** 提取练习比精加工式重学更能带来长期保持 [Karpicke & Blunt 2011, DOI 10.1126/science.1199327]；测试本身会改变记忆，而不只是测量记忆。这一测试效应在元分析层面也稳定存在 [Rowland 2014, DOI 10.1037/a0037559]。

**[推断]** 因此证据链应逐层采集，不能由低层推断高层：

```
再认成功  ≠  能回忆  ≠  能产出
（看见认识）  （遮住能说）  （需要时能用）
```

产品上对应三种题型的**独立计数**，而不是一个总分。一个词可以「再认 5 次全对、回忆 0 次」，这时它仍是「识别态」，不是「掌握」。

### 1.4 FSRS 对首次学习的处理是否足够

**[事实]** FSRS-6 用 21 个参数描述记忆状态（S 稳定性、D 难度、R 可提取性）。第一次评分后的初始稳定性为：

```
S0(G) = w[G-1]，G = 1..4（Again / Hard / Good / Easy）
```

默认参数为 `w0=0.212, w1=1.2931, w2=2.3065, w3=8.2956`，即首次评「Good」对应 S ≈ **2.31 天**，评「Easy」对应 S ≈ **8.30 天** [FSRS 算法文档](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)。FSRS 的定义是 R 从 100% 降到 90% 所需时间，因此在期望保持率 90% 时，首次间隔约等于 S。

**[事实]** FSRS-6 确实包含**同日复习**的短期记忆项：

```
S' = S · exp(w17 · (G − 3 + w18)) · S^(−w19)
```

这说明「一天内多次接触」在模型里有位置，但它描述的是**评分后的短期稳定性增长**，不是「第一次接触如何形成痕迹」。

**[事实]** Anki 官方文档对 FSRS 与学习步骤的边界说得很明确：学习步骤应短于 1 天、尽量少；原文「Evidence shows that repeating a card multiple times in a single day does not significantly contribute to long-term memory」（译：证据显示，一天内重复同一张卡片对长期记忆没有显著贡献），因此更值得把时间花在别的卡片上；并且 Hard 不能在忘记时使用，FSRS 会假设你已经回忆成功 [Anki Manual: Deck Options](https://docs.ankiweb.net/deck-options.html)。

**结论 [推断]**：FSRS 足以调度「第一次有效评分之后」，但不足以判断「第一次评分是否有效」。把「看了新词觉得眼熟」直接喂给 FSRS，等于用一个为「回忆结果」校准的模型去解释「再认结果」，会系统性高估 S。

**ts-fsrs 5.4 的对应关系 [事实]**：该版本对应 FSRS-6，状态机为 `New(0) / Learning(1) / Review(2) / Relearning(3)`，并提供 `enable_short_term`、`learning_steps`、`relearning_steps` 参数 [ts-fsrs v5.4 README](https://github.com/open-spaced-repetition/ts-fsrs/tree/v5.4.0)。也就是说，「初学」在库里有独立状态，只是产品把它压成了「未学 / 在学」两态。

### 1.5 初学阶段的间隔建议

**答案：是，初学应该用不同于复习的间隔。**

**[建议]** 用「显式短步骤 + 毕业交给 FSRS」，而不是让 S0 直接决定第一次长间隔：

| 阶段 | 时机 | 任务 | 是否计入 FSRS |
|---|---|---|---|
| 呈现 | 第 0 分钟 | 词 + 释义 + 一个例句 + 发音 | 否（仅记为 exposure） |
| 再认检查 | 第 0–2 分钟 | 四选一，干扰项要近义 / 同词性 | 否，或记为弱信号 |
| 首次回忆 | 第 5–10 分钟 | 看词说义，先想 2 秒再揭晓 | 是，首次评分 |
| 短期巩固 | 第 10–30 分钟 | 再认 + 回忆各 1 次（最多 3 次） | 是（FSRS-6 同日项） |
| 毕业 | 次日 | 回忆成功 → 进入 Review | 是 |
| 后续 | 1d → 3d → 7d → FSRS | 交给 FSRS 按目标保持率排 | 是 |

理由：间隔效应表明，最佳间隔随目标保持期延长而延长，且**早期过长的间隔会让首次提取失败率过高**，失败后的 S 会大幅下降 [Cepeda et al. 2006]；睡眠对陈述性记忆的巩固在学后当晚最明显 [Rasch & Born 2013]。所以初学阶段「短而有效」比「一次给 8 天」更稳。

---

## 2. 「知道 / 不知道」自评是否科学

### 2.1 元认知准确性：自评比想象中差

- **[事实]** Koriat 与 Bjork 发现，学习者在学习过程中对自己的掌握程度会产生**能力错觉（illusion of competence）**：判断依据是加工流畅性、材料关联性等线索，而不是未来能否提取；材料越相关、读起来越顺，越容易高估 [Koriat & Bjork 2005, DOI 10.1037/0278-7393.31.2.187]。
- **[事实]** 即时学习判断（immediate JOL）不如**延迟判断**准确；延迟迫使学习者真正尝试提取，提取成败才是更好的线索 [Nelson & Dunlosky 1991, DOI 10.1037/0278-7393.17.2.267]。综述见 [Bjork, Dunlosky & Kornell 2013, DOI 10.1146/annurev-psych-113011-143823]。
- **[事实]** 大学生自述最常用的策略是重读，自测比例很低（约八成以重读为主，约一成为自测），而这恰恰是低效但「感觉有效」的组合 [Karpicke, Butler & Roediger 2009, DOI 10.1080/09658210802647009]。

映射到产品：「知道这个词」这个问题，问的是**熟悉感**，不是**可提取性**。用户看到词形、想起「我见过」，就会点「知道」——这正是流畅性错觉。

### 2.2 再认与回忆不是同一件事

再认只需判断「这个选项像不像」，回忆需要**在没有选项的情况下重建意义**。Laufer 与 Goldstein 的四级分类已经说明，被动识别是四者中最低的门槛 [Laufer & Goldstein 2004]。**[推断]** 用一个再认成功去推断回忆成功，等于把最低门槛的证据当成最高门槛的证据。

更麻烦的是**迁移适当加工（transfer-appropriate processing）**：练习形式决定了哪类提取被训练。只做「看词选义」，训练的是「选项间的辨别」，不是「空手取义」。所以「知道 / 不知道」闪卡即使答对，也不能证明用户能在阅读中认出、或在写作中调用。

### 2.3 自评「知道」直接给长间隔的风险

**[事实]** 首次评「Good」→ S0 ≈ 2.31 天；首次评「Easy」→ S0 ≈ 8.30 天（FSRS-6 默认参数）。**[推断]** 若把「我认识这个词」映射成 Good / Easy，模型会认为这条记忆已经过一次成功回忆，从而给出 2–8 天的间隔；但用户实际只完成了「眼熟判断」。结果是：

1. 首次复习时 R 已经很低，失败概率高；
2. 失败后 S 被下调（post-lapse），后续间隔骤短，用户感觉「怎么老记不住」；
3. 更隐蔽的副作用：用户学会「点知道就能跳过」，把自评变成退出按钮，训练信号彻底失真。

### 2.4 更稳妥的映射方案

**方案 A（推荐）：自评只做路由，不做评分。**

- 「没印象」→ 进入教学卡（释义 + 例句 + 词根 / 搭配），不产生 FSRS 评分。
- 「有印象」→ 直接跳到验证题：看词选义（干扰项用近义、同词性、同主题词）。
- 验证正确 → 记为 **Hard**（S0 ≈ 1.29 天），或进入「识别轨道」，不碰回忆轨道的 S。
- 验证错误 → 记为 **Again**（S0 ≈ 0.21 天），回教学卡。
- 只有**看词说义**成功，才允许 Good；只有**中→英产出**成功，才允许 Easy。

**方案 B（折中）：保留二键，但改变问句与后果。**

- 按钮文案从「知道 / 不知道」改为「**能说出意思 / 说不出**」——把判断对象从熟悉感改成提取预期。
- 点「能说出」后强制 2 秒思考 + 揭晓答案，再让用户勾「说对了 / 说错了」；以揭晓后的判断为准，而不是揭晓前的自信。
- 「说对了」最多映射 Hard，禁止 Easy。

**方案 C（不推荐单独使用）：二键直接映射 Again / Good。** 只有在「纯预习模式、明确不计入长期调度」时才可接受。

**映射表 [建议]：**

| 用户证据 | 认知含义 | 推荐 FSRS 评分 | 首次 S |
|---|---|---|---|
| 看新词，无印象 | 未编码 | 不评分，进教学 | — |
| 看新词，有印象 | 熟悉感 | 不评分，进再认验证 | — |
| 再认正确（四选一） | 形→义再认 | Hard（或独立识别轨道） | ≈1.29 d |
| 再认错误 | 未建立联结 | Again | ≈0.21 d |
| 看词说义成功 | 语义提取 | Good | ≈2.31 d |
| 看词说义，想很久才对 | 提取困难 | Hard | ≈1.29 d |
| 中→英产出成功 | 产出性知识 | Easy（需此前已有回忆成功） | ≈8.30 d |

说明：把再认成功映射到 Hard 是**保守代理**——Hard 的原意是「提取到了但很吃力」，与「四选一选对了」不完全同义。若想要更干净的语义，可以给识别单独一条 S 轨道，不与回忆轨道混用；在单轨道实现里，Hard 至少不会像 Good / Easy 那样把间隔拉长。

**伪词校准 [建议]**：在自评里混入 5–10% 的**伪词（pseudoword）**，用户若声称「知道」，立即暴露。这正是 yes/no 词汇测试的做法：用伪词估计虚报率，再对得分做猜测校正 [Meara & Buxton 1987, DOI 10.1177/026553228700400202]；校正方法见 [Huibregtse et al. 2002, DOI 10.1191/0265532202lt229oa]。产品化后可以给每个用户算一个「自称知道但答错」的偏差率，用来调整个人的自评权重。

### 2.5 二键闪卡什么时候是合理的

**[建议]** 当它被定位为**暴露 / 预习工具**而非**调度工具**时，二键是合理的：快速过一遍「今天要学哪些词」，让用户建立初步印象，不写入 S。真正进入记忆系统的入口，仍然是至少一次带反馈的回忆。这样既保留了你想要的轻量体验，又不污染 FSRS 的状态。

---

## 3. 掌握状态：三态是否太粗

### 3.1 三态的三个问题

1. **维度混淆**：把「记忆强度」（S / R）与「掌握广度」（再认 / 回忆 / 产出）压成一个序数。一个词可以「记得很牢但只会再认」，也可以「刚背会但只能再认一次」。
2. **阈值任意**：没有说明「在学 → 已掌握」需要什么证据，用户无法预期，产品也无法解释。
3. **无滞后（hysteresis）**：一次答对就升级、一次答错就降级，状态会抖动；用户会看到「已掌握」和「在学」来回跳。

**[事实]** 词汇知识本身就是部分的、渐进的，Nation 与 Schmitt 都反对二元掌握观 [Nation 2013; Schmitt 2008]。所以「三态太粗」这个判断，在**用户表达**层面成立；在**调度**层面则不成立——调度真正需要的状态是 FSRS 的 New / Learning / Review / Relearning，三态只是它的投影。

### 3.2 连续掌握度怎么定义

**[建议]** 不要造一个综合分，先分清三个可计算的量：

**(1) 主指标：R(30)，即「30 天后仍能回忆的概率」。**

用 FSRS-6 的遗忘曲线，代入用户自己的参数：

```
factor = 0.9^(−1/w20) − 1
R(t, S) = (1 + factor · t/S)^(−w20)
```

默认参数 `w20 = 0.1542` 时，不同 S 对应的 R(30) 如下（[事实] 按公式计算）：

| S（稳定性） | 含义 | 30 天后回忆概率 |
|---|---|---|
| 0.21 d | 首次 Again | ≈46% |
| 1.29 d | 首次 Hard | ≈61% |
| 2.31 d | 首次 Good | ≈67% |
| 7 d | 一周 | ≈78% |
| 21 d | 三周 | ≈87% |
| 60 d | 两月 | ≈94% |
| 180 d | 半年 | ≈98% |

这张表本身就是最好的产品文案：它告诉用户「记忆会衰减」，也告诉用户「已掌握不是永久」。R(30) 比「掌握度 92 分」诚实得多，因为它是一个**带时间条件的概率**，不是一个终局标签。

**(2) 辅助指标：S 分桶。** 用于排序与筛选（<1d、1–7d、7–30d、30–180d、>180d）。桶比原始小数稳定，不会因为一次复习跳动。

**(3) 辅助指标：正确率 EWMA。** 只统计**首次尝试**，每个词每天最多一次：

```
M_t = α · x_t + (1 − α) · M_{t−1}，α ≈ 0.2–0.3
```

它反映近期表现，但会被「题目难度」污染，所以只做辅助，不做主指标 [推断]。

**不要做的事**：把 R(30)、EWMA、产出次数加权平均成一个 0–100 分。量纲不同、含义不同，平均之后既不可解释也不可行动。

### 3.3 「学完即时更新词库状态」的阈值建议

**[建议]** 状态应由事件**派生**，而不是手工写入。每次复习后立即重算，前端乐观更新；但升级需要满足多个条件，降级只在 lapse 时发生：

| 状态 | 进入条件 | 退出条件 |
|---|---|---|
| 未学 | 无复习记录 | 首次有效评分 |
| 初识 | 1 次成功提取，S < 1d | 次日回忆成功 / 失败 |
| 在学 | S < 21d，或近 30 天有 lapse | S ≥ 21d 且满足稳固条件 |
| 稳固 | S ≥ 21d 且 ≥2 次间隔 ≥7d 的成功回忆，近 60 天无 lapse | 出现 lapse |
| 已掌握（可选） | 稳固 + 至少 1 次产出性成功 + 再认与回忆均成功 | 任一维度失败 |

阈值依据：掌握学习传统上以 **80%–90%** 为达标线，且掌握学习整体有中等正效应 [Bloom 1968; Kulik et al. 1990, DOI 10.3102/00346543060002265]；FSRS 默认目标保持率是 **90%** [Anki Manual](https://docs.ankiweb.net/deck-options.html)。知识追踪（Bayesian Knowledge Tracing, BKT）类系统常把 0.95 的后验掌握概率当阈值，但那是工程惯例，不是词汇学习的实验结论 [Corbett & Anderson 1995, DOI 10.1007/BF01099821]。21 天、7 天间隔、60 天无 lapse 是工程取值，不是文献常数，**依据强度：弱–中**。如果只想要一个粗阈值，可以用「S ≥ 21 天 + 一次跨周成功回忆」，不要用「连续答对 3 次」——连续三次可以发生在同一天，几乎没有证据价值。

### 3.4 避免「已掌握 = 永久记住」的错觉

- **[建议]** 把「已掌握」改名为「**稳固（当前）**」或「长期记忆」，并在旁边显示「预计下次复习：X 天后」与「强度会随时间下降」。
- **[事实]** 长期保持是可能的：Bahrick 对在校学过西班牙语的成年人追踪 50 年，发现部分知识进入「permastore」，可在数十年后保持，但前提是初始学习足够充分、且有后续接触 [Bahrick 1984, DOI 10.1037/0096-3445.113.1.1]。这说明「长期记住」不是神话，但它需要条件，不是点一下「已掌握」就自动获得。
- **[建议]** 不要在「已掌握」状态下停止显示复习入口；可以降低频率，但不要制造「毕业」的错觉。

---

## 4. 分组与顺序：科学边界

### 4.1 字母序

**[推断]** 按首字母分组有三个问题：

1. **正字法邻居密集**。同首字母会自然聚集 adapt / adopt / adept、affect / effect 这类形近词，而形近与义近都会增加初始学习的混淆 [Baxter et al. 2021 引言，DOI 10.3389/fpsyg.2021.688160]。
2. **没有语义支撑**。字母不是语义类别，不能提供主题图式，也不能帮助建立词间联系。
3. **序列位置效应**。在一段固定顺序的列表里，开头与结尾的项目获得更多注意，中段项目被牺牲；长字母段尤其明显。

**[事实]** 元分析显示，以「词」为材料时，**块状呈现优于交错**（g = −0.39，负号表示块状更好），这与数学、绘画材料上交错占优的结论相反 [Brunmair & Richter 2019, DOI 10.1037/bul0000209]。所以「按字母块学」并不能用「blocking 更符合证据」来辩护——它虽然是块状，但块的划分没有学习意义，还叠加了形近干扰。

**例外 [推断]**：如果学习目标是**拼写**而不是词义，按韵脚 / 词族分组（-ight、-ake、-tion）是有意义的，因为它训练的是正字法规则。但此时题型应是听写、补全，而不是「看词选义」。

**结论 [建议]**：字母序只做**索引与查找**，不作为默认学习顺序；进入学习会话时打散。

### 4.2 语义聚类

这是证据最一致的一块，也是产品最需要克制的地方。

- **[事实]** Nation 明确警告不要把语义相关的生词放在一起教，并给出替代做法（主题相关、但不同语义类别的词）[Nation 2000, *Learning Vocabulary in Lexical Sets: Dangers and Guidelines*, TESOL Journal 9(2): 6–10]。
- **[事实]** Waring 重复验证了语义集组的负面效应 [Waring 1997, DOI 10.1016/S0346-251X(97)00013-4]；Erten 与 Tekin 也发现语义集组不如语义无关组 [Erten & Tekin 2008, DOI 10.1016/j.system.2008.02.005]。
- **[事实]** Tinkham 区分了**语义聚类**（同一语义场，如颜色、水果）与**主题聚类**（同一场景，如餐厅，但词分属不同语义类），发现主题聚类优于语义聚类 [Tinkham 1997, DOI 10.1191/026765897672376469]。
- **[事实]** 但「相似」并非绝对有害：Baxter 等人的实验让儿童**对比**形近 / 义近词，结果提升了表征精确度，不过只在阅读能力较强的儿童身上显著，且学习阶段的正确率更低 [Baxter et al. 2021, DOI 10.3389/fpsyg.2021.688160]。

**综合 [推断]**：语义集组的伤害主要发生在**首次学习**——同时建立多条相似联结，彼此竞争。到**复习阶段**，把近义词放在一起做辨析题，反而是有价值的，因为它逼用户注意差异。所以：

- 语义标签：**不用于新词同批学习**，可用于复习辨析。
- 主题 / 情景标签：**可用于新词学习**，但组内避免高度近义。
- 反义词：介于两者之间；成对出现（hot / cold）通常可接受，成组出现（hot / warm / boiling / scorching）应避免。

### 4.3 交错还是块状

**[事实]** Brunmair 与 Richter 的元分析（59 项研究、238 个效应量、158 个样本）显示：整体交错效应 g = 0.42，但高度依赖材料——绘画 g = 0.67、数学 g = 0.34、说明文与味觉不显著，**词汇材料则是块状更好（g = −0.39）**；当类别间相似度高、类别内相似度低时，交错更有利 [Brunmair & Richter 2019]。

**[事实]** 在数学题上，打乱题型顺序提升了学习效果，尽管学习者主观觉得「按题型练」更有效 [Rohrer & Taylor 2007, DOI 10.1007/s11251-007-9015-8]；在类别归纳上，间隔 / 交错也优于集中，但学习者同样判断反了 [Kornell & Bjork 2008, DOI 10.1111/j.1467-9280.2008.02127.x]。

**[建议]** 采用「**初学块状、复习交错**」：

- 新词阶段：一次会话只处理一个小批次（5–10 个），批次内随机顺序，批次间不混。
- 复习阶段：把所有到期词打散，按 FSRS 的 retrievability 升序（最可能忘的优先），不按标签聚堆。
- 只有在做「近义词辨析」专项时，才刻意把易混词放在一起，并且必须带对比反馈。

### 4.4 组的大小与会话结构

**[建议]** 每组 5–10 个新词，理由不是某条实验定律，而是三条工程约束的交集：工作记忆容量、单次会话可完成性、以及 Anki 的负载经验——每天 20 个新词，长期会推到约 200 次/天的复习量 [Anki Manual](https://docs.ankiweb.net/deck-options.html)。新词上限必须和复习负载联动，否则「按组学习」会迅速变成「按组欠债」。

### 4.5 默认策略表

| 分组依据 | 科学评价 | 建议用途 | 默认 |
|---|---|---|---|
| 首字母 | 无学习收益，形近干扰，序列位置效应 | 仅索引 / 查找 | 不作为学习组 |
| 语义标签（同义、反义、同类） | 初始学习干扰最强（Nation 2000; Waring 1997; Erten & Tekin 2008） | 复习辨析 | 禁止新词同批 |
| 情景 / 主题标签 | 主题聚类优于语义聚类（Tinkham 1997） | 新词学习组 | 推荐 |
| 词性 | 中性；同词性近义词仍有干扰 | 筛选 | 可做筛选，不做组 |
| 频率 / 难度 | 高频词有更多后续自然复现，收益更持久 | 默认学习顺序 | 推荐 |
| 来源 / 教材单元 | 自带语境与叙事，利于编码 | 新词学习组 | 推荐 |
| 随机 | 对初学优于语义聚堆 | 兜底 / 复习 | 推荐 |

**[建议]** 产品上把「分组」拆成两个概念：**分区（browsing / navigation）** 与 **学习批次（study batch）**。前者可以按任何维度，后者只允许主题、来源、频率、随机。这样既满足用户「按标签找词」的需求，又不把 UI 分类误当成学习单元。

---

## 5. 目标与连续天数

### 5.1 目标设定理论怎么说

**[事实]** Locke 与 Latham 总结 35 年研究：**具体且有难度的目标**，配合反馈、承诺与任务复杂度管理，能显著提升表现；「尽力而为」式目标效果最差 [Locke & Latham 2002, DOI 10.1037/0003-066X.57.9.705]。

对产品的含义：

- 「每天学 10 分钟」不如「每天完成 20 次有效提取」具体；后者还可验证。
- 目标应分**下限 / 目标 / 挑战**三档，而不是单一环。单环只有 0 和 1，容易在 23:50 变成焦虑源。
- 目标必须是**过程指标**（完成的提取次数、到期清零），不是**结果指标**（记住多少词）——后者用户无法直接控制。

### 5.2 执行意图

**[事实]** 执行意图（implementation intentions）——「如果 X 发生，我就做 Y」——对目标达成的平均效应为 **d = 0.65**（94 项独立检验），机制是提高线索可及性并把行为自动化 [Gollwitzer 1999, DOI 10.1037/0003-066X.54.7.493; Gollwitzer & Sheeran 2006, DOI 10.1016/S0065-2601(06)38002-1]。

**[建议]** 首次设置每日目标时，让用户选一个具体线索：「如果**早饭后**，我就复习 10 分钟」。这比「提醒我每天学习」有效得多，而且成本极低。

### 5.3 目标梯度与「已得进度」

**[事实]** 目标梯度假说：越接近奖励，努力越加速；奖励后再设定新目标，努力会回落（illusionary goal progress）[Kivetz, Urminsky & Zheng 2006, DOI 10.1509/jmkr.43.1.39]。
**[事实]** 「已得进度」（endowed progress）能提高完成率：一开始就送几步，用户把任务视为「已开始」而非「未开始」[Nunes & Drèze 2006, DOI 10.1086/500480]。

**[建议]** 目标环可以保留，但加两个细节：

1. 新用户第一次进入时，给一个**已得进度**（例如首日目标自动算 2 次），降低启动成本。
2. 完成后不要立刻把环清零并弹「再来一轮」；给出一个明确的「今日完成」状态，避免把用户推入无限循环。

### 5.4 连续天数的双刃

**[事实]** Silverman 与 Barasch 统计了 101 个采用连续打卡的应用，并指出 streak 会把「完成活动」变成「维护 streak」这一更高层目标 [Silverman & Barasch 2022, DOI 10.1093/jcr/ucac029]。
**[事实]** Weathers 的研究发现：streak 提供结构、简化决策、并与身份认同相关；但断签后的反应**分化**——有人说「断了，算了」，有人说「断了，赶紧重开」；也有人感到被 streak 控制 [Weathers 2023, DOI 10.1007/s11747-023-00944-4]。

**[推断]** 这与「破罐破摔效应（what-the-hell effect）」一致：一次破戒会导致后续放弃。streak 越长，断签的损失感越大，破罐破摔的风险也越大（损失厌恶，Kahneman & Tversky 1979）。

另一条区分值得保留：**习惯是线索触发的自动化，streak 是需要策略维护的连续记录**。一项 96 人的实地研究发现，习惯自动化达到平台期的中位时间是 **66 天**（范围 18–254 天），远长于「21 天养成习惯」的流行说法 [Lally et al. 2010, DOI 10.1002/ejsp.674]。所以不要用 streak 天数暗示「坚持 21 天就成型」；它只是行为记录，不是习惯本身。

### 5.5 宽恕 / 补签的行为效果

**[建议]** 「每周一次宽恕」方向正确，但需要三个约束：

1. **自动、免费、规则透明**。付费补签会把损失厌恶变成变现，短期留存上升、长期信任下降 [推断]。
2. **补签只恢复连续，不补学习量**。否则用户会把「补签」当成「补课」，记忆系统里没有发生的事不能假装发生。
3. **同时保留「周达标」轨道**。例如「本周 5/7 天达标」，这样即使断签，用户仍有一个未被清零的进度，减少「全有全无」。

依据强度：**中**。行为理论（损失厌恶、破罐破摔、目标梯度）支持宽恕机制；但「每周一次」这个具体频率没有直接 RCT，属于工程取值。行业实践（Duolingo 的 streak freeze）可作为佐证，但不是同行评议证据。

另外，断签后的第二天、周一、月初都是天然的「重新开始」节点（fresh start effect）；宽恕后应顺势重置目标，而不是要求用户「补完欠账」[Dai, Milkman & Riis 2014, DOI 10.1287/mnsc.2014.1901]。

### 5.6 凌晨 4 点日界有没有依据

**检索结论**：未检索到支持「4 点日界」的直接研究。与它相关的可靠证据是：

- 睡眠对陈述性记忆的巩固发生在学后睡眠期间，尤其是慢波睡眠 [Rasch & Born 2013]；
- 人群的睡眠中点差异很大，相当比例的人存在 ≥1 小时的「社会时差」（生物钟与社会时间错位）[Wittmann et al. 2006, DOI 10.1080/07420520500545979]。

**[建议]** 把 4 点定位为「**学习日边界**」的默认值，而不是科学事实：

- 用本地时区，允许用户在 0–6 点之间调整；
- 文案明确「凌晨 4 点前算前一天」，避免用户以为是 bug；
- 处理夏令时与跨时区旅行：按「本地日历日 + 偏移」计算，不要用固定 UTC 偏移；
- 对习惯 5 点后入睡的用户，4 点会切断一次连续学习，此时应允许改到 6 点。

依据强度：**弱**（无直接研究），但工程上合理，且与「睡眠是学习周期天然边界」的机制一致。

### 5.7 对「每日目标环 + 每周一次宽恕」的评估

| 维度 | 评估 | 说明 |
|---|---|---|
| 目标具体性 | 好 | 环把「学习」变成可计数事件 |
| 反馈即时性 | 好 | 进度可见，符合目标梯度 |
| 启动成本 | 中 | 需要「已得进度」或极低首日目标 |
| 断签风险 | 偏高 | 二值 + 连乘，容易触发破罐破摔 |
| 宽恕机制 | 好 | 方向正确，需自动、免费、只恢复连续 |
| 自主性 | 需注意 | 应允许关闭 streak；外部奖励可能削弱内在动机 [Deci et al. 1999, DOI 10.1037/0033-2909.125.6.627] |
| 游戏化加成 | 有限 | 元分析：认知 g = .49、动机 g = .36、行为 g = .25，且动机与行为效应不稳定 [Sailer & Homner 2020, DOI 10.1007/s10648-019-09498-w] |
| 与记忆目标的一致性 | 中 | 「打卡」不等于「有效提取」，需用质量指标兜底 |

**[建议]** 综合评分：**方向正确，需三处校准**——三档目标、自动宽恕 + 周达标、质量指标（首次正确率 / 到期清零率）作为第二环。不要把「连续天数」放在唯一显眼位置；把它降级为「过程反馈」之一。

---

## 6. 对 WulonVocab 的具体建议清单

| # | 建议 | 依据强度 | 关键来源 |
|---|---|---|---|
| 1 | 新词闪卡改为「呈现 → 再认验证 → 回忆评分」三步；「知道 / 不知道」只做路由，不直接写 S | 强（机制 + 元认知证据） | Koriat & Bjork 2005; Laufer & Goldstein 2004; Anki FSRS 文档 |
| 2 | 首次评分优先用「看词说义」；再认成功最多映射 Hard，禁止 Easy | 中–强 | FSRS-6 S0 参数；Laufer & Goldstein 2004 |
| 3 | 初学采用显式短步骤（10–30 分钟 → 1 天 → 3 天），毕业后再交给 FSRS | 中 | Anki Manual; Cepeda 2006; Rasch & Born 2013 |
| 4 | 同日重复不超过 3 次，且必须是提取而非重读 | 中 | Anki Manual（同日重复对长期记忆贡献小） |
| 5 | 三态保留为内部调度投影；用户侧改为「记忆强度（R30 / S 桶）+ 掌握层次（再认 / 回忆 / 产出）」两维 | 中 | Nation 2007; Schmitt 2008; FSRS 公式 |
| 6 | 用 R(30) 作为「连续掌握度」主指标，显示为概率与「下次复习」，不显示 0–100 总分 | 中（公式事实 + 设计推断） | FSRS-6 遗忘曲线 |
| 7 | 「已掌握」升级需 S ≥ 21d + 两次跨周成功 + 一次产出验证；lapse 立即降级 | 弱–中（工程阈值） | 掌握学习 80–90% 标准（Bloom 1968; Kulik 1990）；FSRS 90% |
| 8 | 文案避免「已掌握 = 永久」；用「稳固（当前）」+ 衰减提示 | 中 | Bahrick 1984; FSRS R 定义 |
| 9 | 字母序只做索引，不作为学习顺序；学习批次按主题 / 来源 / 频率 / 随机 | 中 | Brunmair & Richter 2019; Baxter 2021 |
| 10 | 语义标签禁止用于新词同批；仅用于复习辨析 | 强 | Nation 2000; Waring 1997; Erten & Tekin 2008 |
| 11 | 主题 / 情景标签可用于新词学习，组内避免高度近义 | 中 | Tinkham 1997 |
| 12 | 初学块状（每组 5–10 词），复习交错并按 retrievability 排序 | 中–强 | Brunmair & Richter 2019; Rohrer & Taylor 2007 |
| 13 | 目标用「有效提取次数」而非时长；设下限 / 目标 / 挑战三档 | 中 | Locke & Latham 2002 |
| 14 | 首次设置目标时引导写「如果…就…」执行意图 | 强（d=0.65） | Gollwitzer 1999; Gollwitzer & Sheeran 2006 |
| 15 | 目标环加「已得进度」，完成后给明确结束状态 | 中 | Nunes & Drèze 2006; Kivetz 2006 |
| 16 | 每周 1 次自动免费宽恕 + 「周达标」备用轨道；streak 可关闭 | 中（理论支持，频率为工程值） | Weathers 2023; Silverman & Barasch 2022; Deci 1999 |
| 17 | 4 点日界保留为默认但可配置，明确「学习日」语义 | 弱（无直接研究） | Rasch & Born 2013; Wittmann 2006 |
| 18 | 自评混入 5–10% 伪词，估计个人虚报率并调权 | 中 | Meara & Buxton 1987; Huibregtse 2002 |

---

## 7. 参考来源

**词汇学习与教学**

- Nation, I. S. P. (2007). The Four Strands. *Innovation in Language Learning and Teaching*, 1(1), 1–12. https://doi.org/10.2167/illt039.0
- Nation, I. S. P. (2000). Learning Vocabulary in Lexical Sets: Dangers and Guidelines. *TESOL Journal*, 9(2), 6–10.
- Nation, I. S. P. (2013). *Learning Vocabulary in Another Language* (2nd ed.). Cambridge University Press.
- Schmitt, N. (2008). Instructed second language vocabulary learning. *Language Teaching Research*, 12(3), 329–363. https://doi.org/10.1177/1362168808089921
- Webb, S. (2007). The Effects of Repetition on Vocabulary Knowledge. *Applied Linguistics*, 28(1), 46–65. https://doi.org/10.1093/applin/aml048
- Uchihara, T., Webb, S., & Yanagisawa, A. (2019). The Effects of Repetition on Incidental Vocabulary Learning: A Meta-Analysis of Correlational Studies. *Language Learning*, 69(3), 559–599. https://doi.org/10.1111/lang.12343
- Webb, S., Uchihara, T., & Yanagisawa, A. (2023). How effective is second language incidental vocabulary learning? A meta-analysis. *Language Teaching*. https://doi.org/10.1017/S0261444822000507
- Laufer, B., & Rozovski-Roitblat, B. (2011). Incidental vocabulary acquisition: The effects of task type, word occurrence and their combination. *Language Teaching Research*, 15(4), 391–411. https://doi.org/10.1177/1362168811412019
- Laufer, B., & Goldstein, Z. (2004). Testing Vocabulary Knowledge: Size, Strength, and Computer Adaptiveness. *Language Learning*, 54(3), 399–436. https://doi.org/10.1111/j.0023-8333.2004.00260.x
- Tinkham, T. (1997). The effects of semantic and thematic clustering on the learning of second language vocabulary. *Second Language Research*, 13(2), 138–163. https://doi.org/10.1191/026765897672376469
- Waring, R. (1997). The negative effects of learning words in semantic sets: A replication. *System*, 25(2), 261–274. https://doi.org/10.1016/S0346-251X(97)00013-4
- Erten, İ. H., & Tekin, M. (2008). Effects on vocabulary acquisition of presenting new words in semantic sets versus semantically unrelated sets. *System*, 36(3), 407–422. https://doi.org/10.1016/j.system.2008.02.005
- Baxter, P., Droop, M., van den Hurk, M., Bekkering, H., Dijkstra, T., & Leoné, F. (2021). Contrasting Similar Words Facilitates Second Language Vocabulary Learning in Children by Sharpening Lexical Representations. *Frontiers in Psychology*, 12, 688160. https://doi.org/10.3389/fpsyg.2021.688160
- Nakata, T. (2011). Computer-assisted second language vocabulary learning in a paired-associate paradigm: a critical investigation of flashcard software. *Computer Assisted Language Learning*, 24(1), 17–38. https://doi.org/10.1080/09588221.2010.520675

**记忆、元认知与练习设计**

- Koriat, A., & Bjork, R. A. (2005). Illusions of competence in monitoring one's knowledge during study. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 31(2), 187–194. https://doi.org/10.1037/0278-7393.31.2.187
- Bjork, R. A., Dunlosky, J., & Kornell, N. (2013). Self-regulated learning: beliefs, techniques, and illusions. *Annual Review of Psychology*, 64, 417–444. https://doi.org/10.1146/annurev-psych-113011-143823
- Nelson, T. O., & Dunlosky, J. (1991). When people's judgments of their own learning are too high or too low. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 17(2), 267–276. https://doi.org/10.1037/0278-7393.17.2.267
- Karpicke, J. D., Butler, A. C., & Roediger, H. L. (2009). Metacognitive strategies in student learning: Do students practise retrieval when they study on their own? *Memory*, 17(4), 471–479. https://doi.org/10.1080/09658210802647009
- Karpicke, J. D., & Blunt, J. R. (2011). Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping. *Science*, 331(6018), 772–775. https://doi.org/10.1126/science.1199327
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380. https://doi.org/10.1037/0033-2909.132.3.354
- Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin*, 140(6), 1432–1463. https://doi.org/10.1037/a0037559
- Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin*, 145(11), 1029–1052. https://doi.org/10.1037/bul0000209
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, 35(6), 481–498. https://doi.org/10.1007/s11251-007-9015-8
- Kornell, N., & Bjork, R. A. (2008). Learning Concepts and Categories: Is Spacing the "Enemy of Induction"? *Psychological Science*, 19(6), 585–592. https://doi.org/10.1111/j.1467-9280.2008.02127.x
- Rasch, B., & Born, J. (2013). About Sleep's Role in Memory. *Physiological Reviews*, 93(2), 681–766. https://doi.org/10.1152/physrev.00032.2012
- Bahrick, H. P. (1984). Semantic memory content in permastore: Fifty years of memory for Spanish learned in school. *Journal of Experimental Psychology: General*, 113(1), 1–29. https://doi.org/10.1037/0096-3445.113.1.1
- Meara, P., & Buxton, B. (1987). An alternative to multiple choice vocabulary tests. *Language Testing*, 4(2), 142–154. https://doi.org/10.1177/026553228700400202
- Huibregtse, I., Admiraal, W., & Meara, P. (2002). Scores on a yes-no vocabulary test: correction for guessing and response style. *Language Testing*, 19(3), 227–245. https://doi.org/10.1191/0265532202lt229oa

**目标、动机与习惯**

- Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation: A 35-year odyssey. *American Psychologist*, 57(9), 705–717. https://doi.org/10.1037/0003-066X.57.9.705
- Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist*, 54(7), 493–503. https://doi.org/10.1037/0003-066X.54.7.493
- Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. *Advances in Experimental Social Psychology*, 38, 69–119. https://doi.org/10.1016/S0065-2601(06)38002-1
- Kivetz, R., Urminsky, O., & Zheng, Y. (2006). The Goal-Gradient Hypothesis Resurrected: Purchase Acceleration, Illusionary Goal Progress, and Customer Retention. *Journal of Marketing Research*, 43(1), 39–58. https://doi.org/10.1509/jmkr.43.1.39
- Nunes, J. C., & Drèze, X. (2006). The Endowed Progress Effect: How Artificial Advancement Increases Effort. *Journal of Consumer Research*, 32(4), 504–512. https://doi.org/10.1086/500480
- Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674
- Dai, H., Milkman, K. L., & Riis, J. (2014). The Fresh Start Effect: Temporal Landmarks Motivate Aspirational Behavior. *Management Science*, 60(10), 2563–2582. https://doi.org/10.1287/mnsc.2014.1901
- Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin*, 125(6), 627–668. https://doi.org/10.1037/0033-2909.125.6.627
- Silverman, J., & Barasch, A. (2022). On or Off Track: How (Broken) Streaks Affect Consumer Decisions. *Journal of Consumer Research*. https://doi.org/10.1093/jcr/ucac029
- Weathers, D. (2023). Defining, and understanding commitment to, activity streaks. *Journal of the Academy of Marketing Science*. https://doi.org/10.1007/s11747-023-00944-4
- Sailer, M., & Homner, L. (2020). The Gamification of Learning: a Meta-analysis. *Educational Psychology Review*, 32, 77–112. https://doi.org/10.1007/s10648-019-09498-w
- Kahneman, D., & Tversky, A. (1979). Prospect Theory: An Analysis of Decision under Risk. *Econometrica*, 47(2), 263–291. https://doi.org/10.2307/1914185
- Wittmann, M., Dinich, J., Merrow, M., & Roenneberg, T. (2006). Social Jetlag: Misalignment of Biological and Social Time. *Chronobiology International*, 23(1–2), 497–509. https://doi.org/10.1080/07420520500545979
- Kulik, C.-L. C., Kulik, J. A., & Bangert-Drowns, R. L. (1990). Effectiveness of Mastery Learning Programs: A Meta-Analysis. *Review of Educational Research*, 60(2), 265–299. https://doi.org/10.3102/00346543060002265
- Bloom, B. S. (1968). Learning for Mastery. *Evaluation Comment*, 1(2), 1–12.
- Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4, 253–278. https://doi.org/10.1007/BF01099821

**算法与官方文档**

- FSRS 算法（含 FSRS-6 参数、初始稳定性、同日复习公式、R 定义）: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- Anki Manual: Deck Options（学习步骤、FSRS、期望保持率 90%、Hard 使用警告）: https://docs.ankiweb.net/deck-options.html
- ts-fsrs v5.4（FSRS-6；State 枚举、enable_short_term、learning_steps）: https://github.com/open-spaced-repetition/ts-fsrs/tree/v5.4.0
- ts-fsrs 文档与 API: https://open-spaced-repetition.github.io/ts-fsrs/

---

## 8. 需产品方拍板的开放问题

1. **新词闪卡的定位**：是「预习 / 暴露」（不计入 S，只决定今天学哪些），还是「正式学习」（必须经过回忆验证才计入）？这决定第 1–2 条建议的落地方式。
2. **「掌握」要不要分维度展示**：接受「再认 / 回忆 / 产出」三条独立进度（更准确但更复杂），还是坚持一个状态标签（更简单但会误导）？
3. **学习目标是阅读 / 考试，还是写作 / 口语**：若偏前者，产出层可以后置；若偏后者，产出证据必须进入「已掌握」的定义。
4. **streak 的产品角色**：是核心留存机制，还是可有可无的过程反馈？这决定宽恕频率、是否允许关闭、以及是否做付费补签。
5. **是否愿意做小规模校准实验**：例如 A/B 比较「自评直接映射」与「自评 + 验证」在 30 天保持率上的差异。没有产品数据，第 1–3 条只能停留在机制推断。
6. **日界与「一天」的定义**：4 点是否要成为用户可见的概念，还是只在后台静默处理？前者需要教育成本，后者会引发「为什么昨天没算」的客服问题。
