# WulonVocab（乌龙单词）自适应学习调研：Duolingo、FSRS 与无后端可行性

> 调研日期：2026-11-17｜范围：公开论文、官方文档、开源实现；不读项目代码｜标记说明：**【事实】** 有公开来源可直接核实；**【推断】** 基于公式或工程经验的估计，未实测；**【建议】** 产品/工程决策建议。

## 0. 结论先行

- **【事实】** Duolingo 的 HLR（Half-Life Regression，半衰期回归）预测“词级回忆概率”，Birdbrain（鸟脑）预测“练习答对概率”；前者是万级稀疏线性模型，后者 V2 才是 LSTM（Long Short-Term Memory，长短期记忆网络）。两者目标不同，公开材料没有说 HLR 被神经网络替换。[S1][S3][S4]
- **【事实】** FSRS（Free Spaced Repetition Scheduler，自由间隔重复调度器）已经提供难度 D（difficulty）、稳定性 S（stability）、可提取性 R（retrievability）和每用户 w 向量优化；它缺的不是“再一个记忆模型”，而是目标/负载、内容排序、反应时、评分可信度等外围层。[S5][S6]
- **【推断】** 纯浏览器下，规则档和统计档都可行；FSRS 参数优化已有 Rust/WebAssembly（WASM）绑定，可放在 Web Worker 里跑；ML 档在单用户数据量下不划算。
- **【建议】** 先做规则档（约 4–7 人日），同时把日志 schema 打好；4–6 周或 ≥2,000 条复习后再上统计档（约 18–30 人日）；ML 档暂不做。
- **【建议】** 100 元/月预算留给 AI 内容与解释，不用于每次复习预测；预测全部本地零成本。

---

## 1. Duolingo 的 HLR 与 Birdbrain

### 1.1 HLR 到底预测什么

**【事实】** Settles 与 Meeder 在 ACL 2016 的论文中提出 HLR：对某个学习者—单词组合，预测在距上次练习 Δ 天后的回忆概率

\[
p=2^{-\Delta/h},\qquad h=2^{\Theta\cdot x}
\]

其中 h 是“半衰期”，Θ 是权重，x 是特征向量。模型直接优化 p 和 h 两个平方误差，加 L2 正则；训练用梯度下降。[S1]

**【事实】** 特征只有两类：

- 交互计数：该用户对该词累计见过、答对、答错的次数（论文发现对计数取平方根更好）。
- 词位标签（lexeme tag）指示变量：每个词位一个 0/1 特征，约 2 万个。

加偏置后，参数量约 2 万级，是稀疏线性模型，不是神经网络；推断时只做一次稀疏点积加指数运算。[S1]

**【事实】** 训练数据为两周内 1,290 万条“学生—单词”练习会话；前 90% 训练、后 10% 测试。公开数据集为 1,300 万条、361 MB。[S1][S2]

**【事实】** 历史日志评测：HLR 的 MAE（Mean Absolute Error，平均绝对误差）为 0.128，Leitner 为 0.235，误差降低约 45%；AUC（Area Under the Curve，曲线下面积）为 0.538，Leitner 为 0.542；半衰期 Spearman 相关为 0.201。去掉 h 项后 MAE 升到 0.350，说明“半衰期”这一项是核心。[S1]

**【事实】** 线上 A/B 有一个反直觉结果：HLR 相对 Leitner 的“任意活动”日留存只提高 0.3%（不显著），练习留存反而下降 7.3%（显著）；但去掉词位特征的 HLR -lex 相对完整 HLR，在“任意活动”上提高 12.0%、在“练习”上提高 9.5%（显著）。作者认为词位特征帮助有限，甚至可能过拟合。[S1]

**【推断】** 对 WulonVocab 的启示不是“照抄 HLR”，而是：一个 2 万参数级的线性模型就能在预测误差上显著优于固定间隔；特征不是越多越好；先上简单模型、用留存/正确率验证，比堆复杂特征更稳。

### 1.2 Birdbrain 是什么、后来有没有升级为神经网络

**【事实】** Birdbrain V1 于 2020 年公布：用受 IRT（Item Response Theory，项目反应理论）启发的逻辑回归，把“练习难度”表示为各组成特征难度之和，“学习者能力”表示为一个标量；每做一道题，对相关参数做一步随机梯度下降（SGD），本质上是 Elo 评分系统的推广。训练最初每晚一次。[S3][S4]

**【事实】** Birdbrain V2 改用 LSTM：把学习者的交互历史压缩成 40 维向量，每做一道题就更新；数据按课中分块流式上报，模型在几分钟内更新；2022 年 5 月完全替换 V1。公开规模是约 5,000 万活跃学习者、每天约 10 亿道练习。[S4]

**【事实】** Birdbrain 预测的是“某学习者做某道练习的正确概率”，用于会话生成器（session generator）选择难度合适的题目；公开材料没有说它预测“用户会不会流失”或“学习风格”。官方博客说 Birdbrain 补充“另一个判断单词掌握程度的个性化系统”，但没有点名那套系统就是 HLR。[S3][S4]

**【推断】** 从公开时间线和任务分工看，HLR 最可能是那套词级系统；但公开材料无法完全确认二者在生产中的接口关系。

**【事实】** 公开可核实程度：HLR 有论文、代码、数据；Birdbrain 只有公司博客与 IEEE Spectrum 的署名文章，没有同行评审论文，也没有公开模型参数量、训练细节和 A/B 效应量。因此“Birdbrain 是 LSTM”可核实，“它具体多大、提升多少”不可核实。[S3][S4]

**【推断】** HLR 与 Birdbrain 是两条互补的产品线，不是“HLR 升级成 Birdbrain”。公开材料没有证据表明 HLR 被神经网络替换；Birdbrain 的收益很大程度来自每天 10 亿条练习的数据飞轮和实时反馈，而不是 LSTM 架构本身。

**【建议】** 不要复刻 Birdbrain 的模型，复刻它的产品逻辑：同时估计“题目难度”和“学习者能力”，把练习放在 80%–90% 正确率的经验区间；但 WulonVocab 的最小单位是单词/卡片，FSRS 才是更合适的核心，Birdbrain 式的“难度匹配”可作为组卷规则。

### 1.3 哪些能迁移，哪些不能

- **【建议】** 可迁移：词级难度先验（词频、词长、是否易混）、目标正确率、用数据而不是拍脑袋调难度、A/B 验证。
- **【建议】** 不可迁移：每天 10 亿条数据、实时流式训练、LSTM 状态向量；单用户应用没有这个数据规模。
- **【建议】** 不要把 HLR 再做成第二套调度器。FSRS 已经给出每张卡的 R；HLR 最多作为“新词难度先验”或“弱词排序”的轻量特征。

---

## 2. 无后端、纯浏览器下的可行自适应

### 2.1 FSRS 本身已经含哪些自适应量

**【事实】** FSRS-6 用 21 个参数描述记忆：每张卡有难度 D∈[1,10]、稳定性 S（R 降到 90% 所需天数）、可提取性 R(t,S)。每次评分后更新 D 和 S；D 越高、S 越大，后续 S 的增幅越小；R 越低时成功复习，S 的增幅越大。FSRS-6 的遗忘曲线衰减本身也是可训练参数 w[20]。[S6]

**【事实】** 目标保持率 r 与间隔的关系为

\[
R(t,S)=\left(1+f\cdot \frac{t}{S}\right)^{-w_{20}},\quad
f=0.9^{-1/w_{20}}-1
\]

\[
I(r,S)=\frac{S}{f}\left(r^{-1/w_{20}}-1\right)
\]

FSRS-6 默认 w[20]=0.1542；当 r=0.9 时 I=S。[S6]

**【事实】** ts-fsrs 5.4 支持 FSRS-6；当前 ts-fsrs 还支持 FSRS-7（34 参数，增加短期稳定性 stabilityFast），但项目已固定在 5.4，不应盲目升级。[S8]

**【推断】** FSRS 已经提供了这些自适应/可调量：每张卡的 D/S、每用户的 w（若开启优化）、全局目标保持率。它没有自适应：新卡引入顺序、单词的考试价值、反应时、动机/疲劳、词与词之间的干扰、考试日期约束。**这些空白才是 WulonVocab 的差异化层。**

**【建议】** 不要再造一个“记忆算法”；把 FSRS 当内核，在外面做“目标 → 计划 → 每日负载 → 实际 → 调整”的闭环。

### 2.2 小型逻辑回归/HLR 能否在 JS 或 WASM 跑

**【事实】** HLR 推断是稀疏点积 + 指数；逻辑回归推断是若干次乘加。[S1]

**【推断】** 两者在 JS 里都是微秒级；在几千到几万条日志上用 SGD（随机梯度下降）训练，JS 也完全够用，不需要 WASM。

**【推断】** 每用户 HLR 不需要 2 万个词位特征；只保留用户词库里的词、词频、历史正确率、最近错误、间隔等十几到几十个特征即可。一个 10–50 维的逻辑回归，在 1 万条样本上训练通常远低于 1 秒。

**【建议】** 如果一定要加小模型，用它回答“下一个该练哪个词/这次评分是否可信”，而不是替代 FSRS 的间隔。评估必须用时间序列切分（不能随机切分），并与 FSRS 的 R 比对数损失（log loss）、校准和 AUC；打不过就不要上线。

### 2.3 ts-fsrs / @open-spaced-repetition 的 optimizer 在浏览器内可行吗

**【事实】** FSRS 官方优化器用最大似然估计（MLE）和沿时间反向传播（BPTT）训练 w 向量；官方 Python 实现基于 PyTorch。[S7]

**【事实】** ts-fsrs 生态里的 `@open-spaced-repetition/binding` 用 Rust `fsrs-rs` + napi-rs 提供 `computeParameters`、`convertCsvToFsrsItems` 等接口；支持 `wasm32-wasip1`，可在浏览器里通过 WASI（WebAssembly System Interface）运行，官方建议放在专用 Worker 里，支持进度回调和取消。该包仍是 public beta，API 可能变。[S9]

**【事实】** 数据门槛：Anki 24.06+ 不再设硬性最低复习数，而是按数据量决定优化哪些参数；24.04 至少 400 条，更早版本至少 1,000 条。Anki 手册同时提醒“少于几百条”属于低数据量，健康检查可能提示拟合不佳；官方建议每月优化一次即可。[S5][S10]

**【推断】** 对 21 个参数的 FSRS-6，2,000–5,000 条复习是较稳妥的起步门槛；5,000–10,000 条更稳；低于 1,000 条建议直接用默认 w。算力上，5,000–50,000 条日志在 WASM Worker 里大概率是秒级到低分钟级；官方没有基准，这是工程推断。

**【建议】** 做一个“对比”界面：默认 w vs 优化 w，在留出集上比 log loss/校准；只有显著更好才采用。优化结果缓存到 IndexedDB；失败或数据不足时回退默认 w；不要一优化就重排全部卡片。

**【事实】** 优化器会被脏数据误导：Anki 明确说“忘了却按 Hard”会让间隔被高估；复习数太少、没有在忘记时按 Again，都会让拟合变差。[S5]

**【建议】** 上线前加数据质量检查：评分分布、Hard 误用率、同日重复率、缺失复习；这些指标也决定“统计档”能不能开。

### 2.4 现在就该落的数据 schema

**【建议】** 即使先做规则档，也按统计档的要求存数据；否则 4 周后想优化却没有日志。

- `review_log`：`card_id`、`word_id`、`timestamp`、`rating`(1–4)、`state_before`(New/Learning/Review/Relearning)、`elapsed_days`、`scheduled_days`、`latency_ms`、`mode`(翻卡/选择题)、`session_id`、`manual_override`、`goal_id`。
- `card_state`：D、S、due、last_review、reps、lapses、`state`、`fsrs_w_version`。
- `goal`：考试日期、每日分钟数、目标保持率、每日新词数、优先词库。
- `plan_snapshot`：日期、计划新词/复习、实际完成、积压。
- `settings`：是否采集反应时、自由模式等级、Easy Days。

这些字段都已在浏览器本地，不上传；统计档只需要把 `review_log` 映射成 revlog 行，喂给绑定即可。[S9]

---

## 3. 反应时（response latency）作为难度/掌握信号

### 3.1 文献怎么说

**【事实】** Benjamin、Bjork 与 Schwartz（1998）的核心警告是“检索流畅性会误导学习判断”：提取很快不等于长期记得牢，流畅感可能让人高估掌握程度。[S15]

**【事实】** van der Linden（2007）提出速度—准确率的分层建模框架：反应时和正确率是两个不同维度，应联合建模，而不是把“快”直接等同于“会”。[S17]

**【事实】** Maris 与 van der Maas（2012）给出同时包含反应时与正确率的评分规则；其正确率部分可化为两参数逻辑模型，时间限制会影响题目区分度。[S18]

**【事实】** Klinkenberg 等（2011）的计算机自适应练习模型用于在线估计能力与难度；其框架引用了上述速度—准确率评分规则，说明反应时可以作为自适应系统的辅助信号。[S16]

**【事实】** Anki 会记录每张卡的作答时间，但官方明确说“The time taken does not influence scheduling”，并且超过 60 秒会按 60 秒计，避免用户离开电脑造成脏数据。[S5]

**【事实】** Duolingo 公开的 Birdbrain 材料主要描述“答对/答错”，没有把反应时列为公开特征；因此不能说 Birdbrain 用了反应时。[S3][S4]

**【推断】** 反应时是噪声很大的个体内信号：同一用户不同日期、不同设备、不同题型都会变；跨用户比较更不可靠。它适合做“相对自己的异常检测”，不适合做绝对掌握度。

### 3.2 怎么用才不惩罚慢思考

**【建议】** 先保证“对/错”决定评分，反应时永远不直接降低一个正确答案的等级。然后按 2×2 使用：

|  | 答对 | 答错 |
|---|---|---|
| **快** | 流畅/可能过熟：不额外缩短间隔，避免流畅性错觉 | 可能猜测/粗心：标记，不当作掌握 |
| **慢** | 努力提取成功：不降级；可提示“这次很费力”，保持或略延长间隔 | 未掌握/遗忘：正常按 Again；检查卡片是否太难 |

**【建议】** 具体做法：

- 按用户、按题型做基线，用对数反应时并做缩尾（如 60 秒封顶）；排除首次曝光、页面切走、输入法停留。
- 只在“慢而对”时给轻度标记（如“需再巩固”），不要自动把 S 调低；FSRS 的评分已经包含“费力”这一档（Hard）。
- 把反应时用于“选任务”（给提示、换题型、建议休息），而不是直接改 FSRS 间隔。
- 如果进入统计模型，必须与“是否正确”做交互项，并限制其权重；用留出集验证，允许用户关闭采集。
- 默认不显示倒计时、不营造速度压力；可提供“思考模式”。

**【推断】** 对 WulonVocab，最有价值的不是“用反应时算难度”，而是“用反应时发现假掌握”：快而错、异常快、异常慢，都是产品可以解释给用户的信号。

---

## 4. 目标驱动的强度调节

### 4.1 desired retention 与 workload 的关系

**【事实】** Anki 手册把 desired retention（期望保持率）称为 FSRS 最重要的设置：默认 90%；越高，间隔越短、每天复习越多；90% 以上工作量上升很快，97% 以上可能难以承受；官方给了指数型的工作量曲线，并提供模拟器让用户看“保持率 X 时每天多少复习/多少分钟”。[S5]

**【推断】** 用 FSRS-6 默认 w[20]=0.1542 代入第 2.1 节公式，可得到同一 S 分布下的相对值（不是个人实测）：

| 期望保持率 | 相对间隔 I/S | 相对复习量 |
|---:|---:|---:|
| 85% | 1.91 | 0.52 |
| 90% | 1.00 | 1.00 |
| 95% | 0.40 | 2.48 |
| 97% | 0.22 | 4.49 |

也就是说，**90%→95% 约 2.5 倍复习量，90%→97% 约 4.5 倍；90%→85% 约减半**。个人参数不同，曲线会变，但“越接近 100% 越陡”是确定的。[S5][S6]

**【建议】** 默认 0.90；考试冲刺只对高价值词库临时提到 0.93–0.95；不要全局开到 0.97 以上；任何调整前先显示预计每日复习量和分钟数。

### 4.2 已有先例：Anki、SuperMemo

**【事实】** Anki 模拟器可以按“模拟天数、额外新卡、每日新卡、每日复习上限、最大间隔”估算每天复习量或分钟数，并使用卡片真实的 D/S/R 和当前参数。[S5]

**【事实】** Anki 曾提供 CMRR（Compute Minimum Recommended Retention，最低推荐保持率），试图找“学得最多、花时间最少”的保持率；该功能在 25.07 移除。它说明“用目标反推保持率”是有产品先例的，但不是一个一劳永逸的公式。[S5]

**【事实】** Easy Days（易日）会在算出间隔后做小幅调整，把复习挪到用户指定的轻松日；所有天都设为“减少”等于没设；它只影响未来间隔，不追溯已排好的卡。[S5]

**【事实】** Anki 24.11 起在 fuzz（随机抖动区间）范围内做负载均衡（load balancing），优先选择当天复习较少的日期；FSRS Helper 插件还提供 Postpone（推迟）、Advance（提前）、Load Balance（负载均衡）、Easy Days、Disperse Siblings（分散同源卡）。[S22][S23]

**【事实】** SuperMemo 的 optimum interval（最优间隔）以 90% 保持率/10% 遗忘率为经典目标；在 SuperMemo 17+ 中，首个最优间隔就是“第一条遗忘曲线降到 90%”的位置；间隔还会做随机分散，并有防止 cramming 的最小间隔增长约束。[S11]

**【事实】** Cepeda 等（2008）用 1,350 多人发现：最优间隔随目标保持期增长而增长；但按“目标保持期的比例”看，1 周后测时约 20%–40%，1 年后测时降到约 5%–10%。所以“间隔=保持期的 10%–20%”只是粗略经验，不是固定定律。[S13]

**【推断】** 对 30 天后考试，首次复习放在 3–6 天（约 10%–20% 的保持期）是合理起点；但最终应由 FSRS 按个人参数和当前 D/S 模拟，而不是套固定比例。

### 4.3 用户设定目标后，系统怎么反推每日负载

**【建议】** 把目标拆成四个输入：目标类型（考试日期/每日词数/期望保持率）、截止日期、每天可用分钟数、当前词库与进度。然后：

1. 用 FSRS 的 D/S/R 和候选新卡数做未来 N 天的模拟；输出每日到期复习量、总时长、积压。
2. 对“每日新词数”做二分搜索，找到满足“P90（90 分位）日负载 ≤ 时间预算”的最大值；同时留 15%–20% 缓冲。
3. 如果无解，按优先级降级：减少新词 → 降低保持率（不低于 0.85）→ 缩小考试范围；不要默默把负载堆到某一天。
4. 考试前 2–4 周逐步停止新词，转为复习为主；若积压过多，先清积压再开新词。
5. 每日实际完成后回写 `plan_snapshot`，用“计划 vs 实际”修正下一次计划。

**【事实】** Anki 手册给了一个量级经验：每天 20 张新卡，稳态大约 200 张复习/天；如果觉得复习太多，减少新卡是最直接的杠杆。[S5]

**【推断】** 这个 10 倍关系适合做初始预算，但会随保持率、卡片难度和中断时间变化；不要把它当精确公式。

**【建议】** 产品上不要只给一个“每日词数”滑块；给“目标 → 预计每天多少分钟 → 能否坚持”的可视化，让用户自己选，而不是系统替用户许愿。

---

## 5. “自由支配模式”的科学边界

### 5.1 哪些自由是安全的

**【事实】** 间隔效应（spacing effect）是记忆研究中重复验证最充分的效应之一：Cepeda 等（2006）汇总 184 篇文章、317 项实验、839 组评估，发现分散练习在长期保持上稳定优于集中练习。[S12]

**【事实】** 测试效应（testing effect）：Roediger 与 Karpicke（2006）发现，延迟测试中，用测试代替重复学习显著提高保持；重复学习还会提高学生对自己掌握程度的信心，但信心并不等于保持。[S14]

**【事实】** 自我调节学习可以是有效的，但有条件：Tullis 与 Benjamin（2011）发现，允许学习者自定学习时间，只有在他们把更多时间分配给“自己觉得难”的词时，才优于固定分配；而实验中不到一半的人采用了这种策略。[S19]

**【事实】** 学习者常高估集中练习：Kornell 与 Bjork（2008）发现，穿插/分散学习画家的作品更有利于辨认新作品，但不少参与者仍觉得“连续看同一画家”更有效。[S20]

**【事实】** Bjork、Dunlosky 与 Kornell（2013）总结：人们对“自己怎么学会的”有错误心智模型，容易把当前流畅感当成长期掌握，从而错误管理学习。[S21]

**【建议】** 安全的自由包括：

- 选内容：今天学哪个词库、哪些主题、哪些词。
- 选顺序：同一会话内随机/交错；允许“弱词优先”，但不要永远“简单优先”。
- 选上限：每日新词数、每日复习上限、Easy Days。
- 选目标：0.85–0.95 的期望保持率（显示代价）。
- 选形式：翻卡、选择题、拼写、听写；都是提取练习，形式可换。
- 有限手动调整：在 fuzz（随机抖动区间）范围内、最多 ±20% 提前或推迟；把某张卡 suspend；对 leech（顽固卡）做专门处理。
- 额外练习：对弱词做“额外提取”，但分散到多天，不替代到期复习。

### 5.2 哪些自由会破坏间隔效应

**【事实】** Anki 手册明确说：同一天把同一张卡重复很多次，对长期记忆贡献不大；学习步骤应短于 1 天，剩下的交给 FSRS。[S5]

**【事实】** Anki 手册还警告：如果复习排序长期固定为“按牌组、再按到期”，材料总以同样顺序出现，用户更容易靠上下文猜答案，记忆更弱。[S5]

**【事实】** FSRS 依赖评分语义：忘记时按 Hard 会被当成“想起来但费力”，导致间隔被高估；Anki 明确要求忘记时按 Again。[S5]

**【建议】** 会破坏间隔效应的自由包括：

- 手动把大量卡的间隔改得很短，或在同一天反复“刷”同一张卡。
- 反复重置进度、用 Easy 跳过、把 Again 当 Hard。
- 长期不复习，考前一次性突击（massing，集中练习），然后停掉。
- 为了“舒服”永远按简单优先/固定顺序。
- 把期望保持率降到很低来减少工作量（会带来更多遗忘和重学）。
- 用“学习风格匹配”做个性化（没有可靠证据支持 meshing hypothesis）。[S24]

**【建议】** 产品护栏：

- 最小间隔 = max(1 天, FSRS 推荐间隔的 50%)；低于此值需要二次确认。
- 同一天同一张卡只允许学习步骤内的重复；额外练习进入“cram（突击）模式”，不写 FSRS 状态。
- 手动改间隔时显示“预计增加多少复习/分钟”；专家模式才开放无限制修改。
- 首次使用做 30 秒评分教学：Again=忘了，Hard=想起来但很费力，Good=正常，Easy=太简单。
- 默认随机/交错；允许“弱词优先”，但不允许长期固定“简单优先”。
- 假期模式做“重排/分散”，不要简单删除到期日。

### 5.3 三档自由模式

**【建议】** 引导模式（默认）：系统排程，用户选内容和上限；灵活模式（使用 2 周后解锁）：可调顺序、Easy Days、有限手动改期；专家模式（隐藏）：可改任意间隔，但每次显示后果警告。这样既保留自主感，又不让用户无意中 massing。

---

## 6. 三档落地方案

> 本节的数据门槛、算力、人日、预算影响除标注 **【事实】** 外，均为 **【推断】**；产品取舍为 **【建议】**。人日按“1 名熟悉该代码库的全职工程师”估算，实际取决于 UI 复杂度和测试要求。

### 6.1 规则档（纯启发式）

**做什么**

- 目标规划器：考试日期/每日分钟/期望保持率 → 每日新词与复习上限 → 预计负载。
- 弱词队列：按 lapses、低 S、低 R、最近错误、慢而对标记排序；最多占当日 20%。
- 自由模式护栏：最小间隔、cram 模式隔离、评分教学、后果提示。
- 每日计划卡：今天新词多少、复习多少、预计多少分钟、积压多少。
- 数据 schema 按第 2.4 节落库。

**数据与算力**：只用现有复习日志和卡片状态；每次规划是几十到几百次算术，浏览器内 <1 ms。

**浏览器可行性**：完全可行，无新依赖。

**预估人日**：4–7（MVP 4–5，打磨 7）。

**风险**：启发式会高估/低估负载；用户可能觉得“被管”；目标冲突时缺少解释；没有个性化，容易“看起来智能、其实粗糙”。

**月预算影响**：0。

### 6.2 统计档（小模型或 FSRS 参数优化）

**做什么**

- 浏览器内 FSRS-6 w 优化：IndexedDB → revlog → `@open-spaced-repetition/binding` → w 对比/回退。
- 目标模拟器：用真实 D/S/R 做蒙特卡洛或解析近似，输出 P50/P90（50/90 分位）每日复习/分钟；二分搜索每日新词。
- 轻量模型（可选）：10–50 维逻辑回归/HLR 变体，用于弱词排序或“评分可信度”，不替代 FSRS。
- 负载均衡/Easy Days：在 fuzz 内挪动到期日；按星期几平滑。
- 数据质量与异常：Hard 误用、同日 massing、异常快/慢、长期缺失。

**数据与算力**：2,000–5,000 条以上复习更稳；优化器 21 参数，WASM Worker；模拟 1,000–10,000 条路径；逻辑回归 <1 秒。整体秒级到低分钟级。

**浏览器可行性**：可行，但需要额外 WASM 包、Worker、缓存与回退；public beta API 要锁版本。

**预估人日**：18–30（优化器 6–8、模拟器 5–8、数据管道 3–5、UI/评估 4–9）。

**风险**：小数据过拟合；优化器/模拟器结果被用户当成“精确预言”；WASM 包体积与兼容性；评分脏数据；手动改期污染日志；隐私解释成本。

**月预算影响**：0；可选 AI 解释 5–10 元/月，仍远低于 100 元。

### 6.3 ML 档（神经网络）

**做什么**

- LSTM/GRU/Transformer 做序列知识追踪，预测下一次答对概率/学习状态；item embedding；或用公开数据预训练、浏览器内 ONNX（Open Neural Network Exchange）/WebGPU 推理。
- 可做“行为预测”（何时可能放弃、下一次是否会答错），但需要大量事件和明确的产品动作。

**数据与算力**：全局模型至少 10 万–100 万级事件；单用户微调至少 1 万级；训练在离线 GPU，推理 1–10 ms；模型 1–20 MB。

**浏览器可行性**：技术上可行（ONNX Runtime Web/WebGPU），但冷启动、下载体积、兼容性和维护成本都高。

**预估人日**：45–70+（数据 10–15、训练/评估 15–25、导出/集成 10–15、UX/验证 10–15）。

**风险**：没有数据飞轮；单用户数据必然过拟合；分布漂移；提升很可能打不过“FSRS + 规则”；可解释性差；隐私与合规；长期维护成本高。

**月预算影响**：小模型训练一次性 0–100 元（免费 Colab/CPU 可覆盖），推理 0；更大模型不止；工程成本远高于预算节省。

### 6.4 对比与推荐

| 维度 | 规则档 | 统计档 | ML 档 |
|---|---|---|---|
| 核心 | 目标规划 + 弱词队列 + 护栏 | FSRS w 优化 + 负载模拟 + 轻量模型 | 序列神经网络 |
| 数据门槛 | 无 | 2k–5k 条较稳 | 10 万级起 |
| 浏览器 | 无新依赖 | WASM Worker 可行 | ONNX/WebGPU 可行但重 |
| 人日 | 4–7 | 18–30 | 45–70+ |
| 主要风险 | 粗糙、假精确 | 过拟合、beta API | 没数据、收益不明 |
| 月预算 | 0 | 0（可选 5–10） | 0–100 一次性 |

**【建议】** 起步档选规则档，但按“统计档-ready”的方式埋数据。理由：

1. 产品方要的“按目标调强度、自由支配”主要是**规划与护栏**问题，不是模型问题；规则档就能交付大部分体验。
2. 统计档的最大门槛不是算力，而是数据量；先跑 4–6 周，确认用户能积累 2,000 条以上复习，再开优化器。
3. ML 档在单用户场景没有数据飞轮；Duolingo 的 Birdbrain 优势来自每天 10 亿条练习，不是“用了 LSTM”本身。[S4]
4. 100 元/月更适合花在 AI 词库管家/解释/例句，而不是每次复习调用大模型；延迟、成本和隐私都不划算。

**推荐路线**

- 第 1–2 周：规则档 MVP（目标规划、弱词队列、护栏、数据 schema）。
- 第 3–6 周：观察数据；补评分教学、Easy Days、计划 vs 实际复盘。
- 第 7 周起：若 ≥2,000 条复习，接 FSRS optimizer + 目标模拟器；先做“对比页”，不自动重排。
- 只有当用户量/数据量显著增长，且规则+统计档仍不能满足明确指标时，再评估 ML 档。

---

## 7. 需产品方拍板的开放问题

1. **目标冲突时谁优先？** 考试日期、长期保持、每日可用时间三者冲突时，系统应该降新词、降保持率，还是缩小范围？这决定规划器的默认策略。
2. **自由模式的边界在哪？** 允许用户手动改间隔到多大范围？系统能否拒绝“明显 massing”的操作，还是只警告？
3. **反应时采不采、怎么用？** 是否记录每张卡的 latency？是否展示给用户？是否允许关闭？是否只做“假掌握”标记而不进模型？
4. **数据门槛怎么承诺？** 目标用户平均能否在 4–6 周积累 2,000 条复习？如果达不到，是否接受“全局默认参数 + 轻量规则”，而不是宣传“个性化 AI”？
5. **100 元/月怎么花？** 是否同意预测全部本地零成本，预算只用于 AI 内容/解释？还是愿意为“更准的预测”调用云端模型（会带来成本、延迟、隐私问题）？
6. **成功指标是什么、怎么评估？** 考试通过、长期保持、日活/留存，还是用户主观“更省心”？无后端时，是否允许匿名本地统计/导出用于评估？

---

## 8. 来源清单

| ID | 类型 | 来源 |
|---|---|---|
| S1 | 论文 | Settles & Meeder, *A Trainable Spaced Repetition Model for Language Learning*, ACL 2016. https://aclanthology.org/P16-1174/ ；DOI: 10.18653/v1/P16-1174 |
| S2 | 官方代码/数据 | Duolingo, `halflife-regression`. https://github.com/duolingo/halflife-regression |
| S3 | 官方博客 | Duolingo, *Learning how to help you learn: Introducing Birdbrain!* 2020-10-07. https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/ |
| S4 | 行业文章（公司作者） | Bicknell, Brust & Settles, *How Duolingo's AI Learns What You Need to Learn*, IEEE Spectrum, 2023-02-05. https://spectrum.ieee.org/duolingo |
| S5 | 官方文档 | Anki Manual, *Deck Options*（FSRS、desired retention、simulator、Easy Days、timers）. https://docs.ankiweb.net/deck-options.html |
| S6 | 官方项目文档 | FSRS, *The Algorithm*（FSRS-6 公式、21 参数、默认 w）. https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm |
| S7 | 官方项目文档 | FSRS, *The mechanism of optimization*（MLE、BPTT）. https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-mechanism-of-optimization |
| S8 | 官方项目文档 | ts-fsrs README. https://github.com/open-spaced-repetition/ts-fsrs |
| S9 | 官方项目文档 | `@open-spaced-repetition/binding` README（WASI/browser/Worker/optimizer）. https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md |
| S10 | 官方项目文档 | FSRS4Anki tutorial（优化器最低数据量说明）. https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md |
| S11 | 官方 wiki（SuperMemo） | SuperMemo Guru, *Optimum interval*. https://supermemo.guru/wiki/Optimum_interval |
| S12 | 论文 | Cepeda, Pashler, Vul, Wixted & Rohrer, *Distributed practice in verbal recall tasks: A review and quantitative synthesis*, Psychological Bulletin, 2006. https://doi.org/10.1037/0033-2909.132.3.354 |
| S13 | 论文 | Cepeda, Vul, Rohrer, Wixted & Pashler, *Spacing effects in learning: A temporal ridgeline of optimal retention*, Psychological Science, 2008. https://doi.org/10.1111/j.1467-9280.2008.02209.x |
| S14 | 论文 | Roediger & Karpicke, *Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention*, Psychological Science, 2006. https://doi.org/10.1111/j.1467-9280.2006.01693.x |
| S15 | 论文 | Benjamin, Bjork & Schwartz, *The Mismeasure of Memory: When Retrieval Fluency Is Misleading as a Metamnemonic Index*, JEP: General, 1998. https://doi.org/10.1037/0096-3445.127.1.55 |
| S16 | 论文 | Klinkenberg, Straatemeier & van der Maas, *Computer adaptive practice of Maths ability using a new item response model for on the fly ability and difficulty estimation*, Computers & Education, 2011. https://doi.org/10.1016/j.compedu.2011.02.003 |
| S17 | 论文 | van der Linden, *A Hierarchical Framework for Modeling Speed and Accuracy on Test Items*, Psychometrika, 2007. https://doi.org/10.1007/s11336-006-1478-z |
| S18 | 论文 | Maris & van der Maas, *Speed-Accuracy Response Models: Scoring Rules based on Response Time and Accuracy*, Psychometrika, 2012. https://doi.org/10.1007/s11336-012-9288-y |
| S19 | 论文 | Tullis & Benjamin, *On the effectiveness of self-paced learning*, Journal of Memory and Language, 2011. https://doi.org/10.1016/j.jml.2010.11.002 |
| S20 | 论文 | Kornell & Bjork, *Learning Concepts and Categories: Is Spacing the "Enemy of Induction"?*, Psychological Science, 2008. https://doi.org/10.1111/j.1467-9280.2008.02127.x |
| S21 | 论文 | Bjork, Dunlosky & Kornell, *Self-Regulated Learning: Beliefs, Techniques, and Illusions*, Annual Review of Psychology, 2013. https://doi.org/10.1146/annurev-psych-113011-143823 |
| S22 | AnkiDroid 官方 changelog | AnkiDroid Changelog（Anki 24.11：load balancing、FSRS simulator、Easy Days）. http://docs.ankidroid.org/changelog.html |
| S23 | 开源插件（open-spaced-repetition） | FSRS4Anki Helper（Postpone/Advance/Load Balance/Easy Days/Disperse Siblings）. https://github.com/open-spaced-repetition/fsrs4anki-helper |
| S24 | 论文 | Pashler, McDaniel, Rohrer & Bjork, *Learning Styles: Concepts and Evidence*, Psychological Science in the Public Interest, 2008. https://doi.org/10.1111/j.1539-6053.2009.01038.x |

---

### 附：一句话回答产品方的三个诉求

- **“想要智能化”**：多邻国的“神经网络”主要是 Birdbrain V2 的 LSTM，预测的是“这道题你会不会答对”，不是“你的人生目标”；真正可迁移的是“难度匹配 + 数据闭环”，不是模型架构。[S4]
- **“想要自由支配”**：自由应给在“学什么、先学哪类、每天多少”，不应给在“把间隔压到很短、同一天反复刷同一张卡”；前者有自主性收益，后者破坏间隔效应。[S12][S19][S5]
- **“FSRS 还缺什么”**：缺目标/负载规划、内容排序、反应时与评分可信度、考试日期约束、词间干扰；不缺第三个记忆公式。[S5][S6]
