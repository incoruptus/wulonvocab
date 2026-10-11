# 学习科学深化 · 调研与设计（2026-10）

> 来源：调研子代理报告（仅调研，无代码改动）。证据核验日期 2026-10-11（官方文档在线核验；论文核验 DOI/元数据）。
> 标签：文中"事实=已核验；推断=分析判断"，与原文一致。

## 0. 现状快照与系统约束

- 调度：ts-fsrs 5.4（= **FSRS-6**，v5.0.0 CHANGELOG 明确升级）；保持率 clamp 0.7–0.98 + fuzz；已掌握=Review 且间隔 ≥21 天；会话内回炉=Learning/Relearning 且 20 分钟内到期，插到队首后第 4 位。
- 队列：先复习后新词、due 升序、每书每日限额（新词 15/日、复习 200/日、保持率 0.9）。
- 题型：翻卡四档（D/F/J/K）；EN→ZH 四选一（同词性/长度相近/排除包含 + 洗牌袋 + 种子稳定）；答对记 3、答错记 1；答对可 800ms 自动前进，答错强制停留。
- 统计：heatmap/streak/accuracy30/medianStability；负载建议与止损文案在 `advice.ts`。
- 边界：学习主循环必须离线可用；写入只经 store actions；applyReview 不写 updatedAt、SRS 独立合并、daily 逐计数器 max；新交互必须有键位提示。

## 结论摘要

1. 算法层已在第一梯队（FSRS-6 纯函数引擎，预览/评分共享 now）：本阶段收益最大处是**题型与评分**，不是调度算法。
2. 长期保持靠「检索」而非「认出」：测试效应证据强（Yang 2021 元分析等）；再认正确率系统性高估掌握度，且**无反馈时竞争性错项会制造假知识**（Roediger & Marsh 2005）。
3. 调度单位建议「**一词一调度 + 题型轮换**」，暂不引入 Anki 式「一 note 多卡独立调度」；在数据模型上预留 `srsByMode` 演进（v2 决策）。
4. 干扰与语境落地规则：近形/近义/同语义场词不同场相邻（bury siblings/Tinkham/Erten & Tekin）；Cloze 是低成本高收益语境线索；初级双语/双解优于纯英英（Laufer & Hadar 1997）。
5. 动机侧做「宽恕设计」：习惯中位 ~66 天且漏一天不破坏曲线（Lally 2010）；顽固词需 leech 闭环（Anki 阈值 8，改卡/删除/搁置三选一）。
6. 先做 Top7 的 1/2/3/4 项（≤14 人日，不破坏现有数据与同步语义）；5/6/7 排后续；开放问题先拍板。

## 首要改造清单（Top 7）

### T1 题型轮换：识别 → 回忆 → 产出（3–5 人日）
- New/Learning：翻卡揭示 + 高置信 MC；Review 早期：翻卡为主混 MC；稳定后（scheduledDays ≥10）与已掌握复核：产出题（ZH→EN 拼写/口述自评）。任一题型答错回上一档支持形式。
- 证据：Yang 2021（Psychol Bull 147(4):399-435）；Roediger & Karpicke 2006；Karpicke & Roediger 2008；Webb 2005；85% 甜点（Wilson 2019, Nat Commun 10:4646）。
- 落点：`StudyConfig.quizMode` 升级为轮换策略配置；`StudySession.tsx` `effectiveMode` 按词 srs 阶段求值；题型写入 daily log（注意同步逐计数器 max 合并）。
- 风险：同一 srs 被不同难度题型喂料致 FSRS difficulty 漂移 → 配合 T2 封顶与题型标记。

### T2 评分完整性：MC 封顶 Good + 错误必纠 + 置信/时延信号（1.5–2.5 人日）
- MC 答对**最高 Good**，永不 Easy；答错必 Again 且停留展示答案（现状保持为硬规则）；答对加轻量「稳/猜」二选一（可跳过），「猜」降记 Hard；记录答题时延，长时延/高错词优先给回忆题型。
- 证据：Roediger & Marsh 2005 假知识；Little & Bjork 2014/15（反馈时机调控，doi:10.3758/s13421-014-0452-8）；Koriat & Bjork 2005；Wilson 2019。
- 落点：`StudySession.tsx` 3/1 映射与自动前进判定；`StudyDailyLog` 加 `choiceCorrectGuessed`/时延桶；`ChoiceCard` 加置信二选一。
- 风险：额外点击需可跳过、不阻塞；时延只作排序权重。

### T3 队列相似度避让（2–3 人日）
- 两词满足任一：headword 编辑距离 ≤2（长度 ≥4）、首义项高重叠、共享语义标签 → 至少隔 4 张卡；提供「本场允许相似词」开关（易混组专项）。
- 证据：Anki bury siblings / leech 文档（形似词先学一个）；Tinkham 1993/1997；Erten & Tekin 2008；Kornell & Bjork 2008。
- 落点：`queue.ts` 贪心间隔检查（headword 前 3 字符分桶）；回炉插入位置从固定 4 改「满足间隔的第一空位」。
- 风险：软约束不阻塞队列；大词库同前缀多需实测。

### T4 语境题：例句 Cloze + 双语按需（4–6 人日）
- 新增「例句填空」：挖去目标词（含变形），先回忆再揭示；揭示先英文整句，中文按需再点。准入：≤12 词、除目标词外未知 ≤1、含目标词或其变形，否则回退翻卡。
- 证据：生成效应（Slamecka & Graf 1978）；参与负荷（Laufer & Hulstijn 2001）；98% 舒适线（Schmitt 2011）/95% 最低（Hu & Nation 2000）；双解最优（Laufer & Hadar 1997）。
- 落点：`examples` 已入库；新增 `ClozeCard` + 纯函数 `buildCloze`（单测）；键位提示按约定。
- 风险：例句缺→优雅回退；变形轻量词干规则；未知词判断初期放宽。

### T5 顽固词（leech）闭环（3–4 人日）
- `lapses ≥ 8` 标记顽固词（可配置）；小结与筛选可见；三动作：搁置 7/30 天、改卡（跳编辑，提示减信息量/加例句）、降级建议；半阈值预告；不自动静默搁置。
- 证据：Anki leeches 手册（阈值 8/半阈值警告/三选一）；Metcalfe 2017（纠错是学习机会）。
- 落点：`StudySrs.lapses` 已有；`queue.ts` 过滤搁置；搁置状态建议先纯本地（避免改变同步合并语义）。
- 风险：搁置若进载荷需明确 LWW 语义；文案不得"失败"框架。

### T6 习惯与止损：目标环、宽恕 streak、session 止损（3–5 人日）
- 日目标以到期完成度为主（分母=当日期望负载，`advice.ts` 容量模型）；streak 改「本周 5/7」周视图 + 每周一次休息日/补签；accuracy<60% 或连续 5 次 Again 时底部出现「今天先到这（剩余 N 个明天优先）」，不算失败。
- 证据：Lally 2010（66 天/漏一天没事）；目标梯度与赋予进度（Kivetz 2006；Nunes & Drèze 2006）；Anki 负载预警；Wilson 2019。
- 落点：`metrics.ts` 派生周视图；`StudySession.tsx` 底部原位加止损按钮（不位移）。
- 风险：补签过宽削弱信号；止损阈值属工程推断，宁晚勿早。

### T7 拼写题（ZH→EN，IME 安全）+ TTS 策略（5–8 人日）
- 给中文义项（+首字母/长度提示可关），提交后归一化全对比 + 字符级 diff；全对 Good（新题型不给 Easy）、一次错即 Again 并显示正确拼写；「再试一次」不覆盖首评。`compositionstart/end` + `isComposing` 处理中文 IME；关闭 autoCorrect/spellCheck/autoCapitalize。TTS 只做辅助（词头朗读），听音判定不评分。
- 证据：Webb 2005；Karpicke & Roediger 2008；HVPT（Bradlow 1997, JASA 101(4), doi:10.1121/1.418276）；NRP 2000（经典）；TTS 增益属弱证据。
- 落点：新增 `study/spell.ts` + `SpellCard`；`keymap.ts` 新键位。
- 风险：中文 IME（Enter 选词/Shift 切换）需真机矩阵；"一字符之差"宽松度需拍板。

## 分题要点（补充事实与依据）

- **检索/测试效应（强）**：Yang 2021（真实课堂效应量相当）；Roediger & Karpicke 2006（1 周后显著优）；Karpicke & Roediger 2008 / Karpicke & Blunt 2011；MC 选项数 3 即可、干扰项质量更重要（Rodriguez 2005）；85% 训练甜点（Wilson 2019）。推断：MC 期望猜测率 25%，正确≠独立回忆（→ T2）；练什么考什么（→ T1）。
- **调度**：FSRS 出自墨墨 DHP/DSR（KDD 2022 / TKDE 2023 已核 DOI）；Anki 建议：保留率 0.9 默认、学习步 <1 天且越少越好、Hard 必须成功回忆、参数月更。推断：v1.1 一词一调度 + 题型轮换；v2 可选 `Entry.srsByMode?: Record<mode, StudySrs>`（10+ 人日，触及同步与优化器）。
- **干扰/顺序**：同 session 重复对长期贡献小（Anki）→ 建议回炉加「每词每 session 一次」上限（现状 20 分钟 horizon 无限次追加）。相似词避让放「队列邻接」层而非「题内干扰项」层（有反馈时竞争干扰项反而促进辨别）。
- **语境/双语**：Cloze = 带约束检索；gap-fill 给选项退化为再认。揭示次序「英文→中文按需」；A1-A2 默认中英同现，B1 起默认英英 + 中文按需。
- **动机**：streak 收益早期最大，渐转向「计划内完成」；止损阈值无直接文献（工程推断）。
- **听/拼**：HVPT 可保持数月（Bradlow 1997）；拼写评分宽松度（Good/Again/Hard）需拍板。
- **业界对照（关键差距）**：Anki 的 bury/leech/retrievability 排序（我们缺 bury/leech）；Quizlet Learn 的「书写→选择」自动升级（缺）；Memrise 打字优先/Difficult 池（缺）；Duolingo 错题重练/连胜冻结（缺）；墨墨单词级曲线（部分可做 sparkline）；不背「复习时考例句」（T4 覆盖）。

## 明确不建议做的事（反模式）

1. 不给「是否认识」单档自评（四档信息量更大）。
2. 不在同一 session 内对同一词多轮回炉（加每 session 一次上限）。
3. 不在无反馈时用竞争性干扰项（错必示答案，冻结为硬规则）。
4. 不给「断卡清零 + 惩罚性文案」。
5. 不照搬「一题一调度单元」到全部题型（v2 再议）。
6. 不用设备 TTS 听音判定直接评分。
7. 不把选择题正确自动标 Easy。
8. 不强制纯英英释义做默认（初级双语/双解，英英按水平开放）。

## 开放问题（需产品方拍板）

1. 目标用户画像与水平分布（应试 vs 成人兴趣 vs 混合）→ 决定 ZH→EN 与英英默认档位。
2. 是否接受 v2「一词多题型独立调度」（Anki 式）？
3. 拼写宽松度：一字符之差算 Again 还是 Hard？「再试一次」是否影响首评？
4. 顽固词搁置是否进跨端同步？
5. streak 休息日/补签规则与凌晨 4 点日界（与 ROADMAP v1.1 一致）。
6. 会话止损阈值数值与文案。
7. 相似词避让默认软约束，还是「易混组同场」显式模式？
8. 例句缺失是否允许 AI 补（AI 可选边界内显式开关）。

## 来源清单（核验 2026-10-11）

- Anki 手册 deck-options / studying / leeches / FSRS FAQ（docs.ankiweb.net）；fsrs4anki 与 free-spaced-repetition-scheduler README；ts-fsrs CHANGELOG（5.0.0 FSRS-6）
- Erten & Tekin 2008 doi:10.1016/j.system.2008.02.005；Tinkham 1993 doi:10.1016/0346-251X(93)90027-E；Tinkham 1997 doi:10.1191/026765897672376469
- Webb 2005 doi:10.1017/s0272263105050023；Schmitt 2011 doi:10.1111/j.1540-4781.2011.01146.x；Hu & Nation 2000 doi:10.26686/wgtn.12560354；Nation 2006 doi:10.26686/wgtn.12552221；Laufer & Hadar 1997 doi:10.1111/j.1540-4781.1997.tb01174.x
- Roediger & Karpicke 2006 doi:10.1111/j.1467-9280.2006.01693.x；Karpicke & Roediger 2008 doi:10.1126/science.1152408；Karpicke & Blunt 2011 doi:10.1126/science.1199327；Roediger & Marsh 2005 doi:10.1037/0278-7393.31.5.1155；Little & Bjork doi:10.3758/s13421-014-0452-8
- Rodriguez 2005 doi:10.1111/j.1745-3992.2005.00006.x；Yang 2021 doi:10.1037/bul0000309；Wilson 2019 doi:10.1038/s41467-019-12552-4；Kornell & Bjork 2008 doi:10.1111/j.1467-9280.2008.02127.x；Cepeda 2006 doi:10.1037/0033-2909.132.3.354；Metcalfe 2017 doi:10.1146/annurev-psych-010416-044022
- Lally 2010 doi:10.1002/ejsp.674；Su 2023 doi:10.1109/tkde.2023.3251721；Ye, Su & Cao 2022 doi:10.1145/3534678.3539081；Settles & Meeder 2016 doi:10.18653/v1/P16-1174；Bradlow 1997 doi:10.1121/1.418276
- 经典（未逐条在线核验）：Bjork & Bjork 2011；Slamecka & Graf 1978；Laufer & Hulstijn 2001；Koriat & Bjork 2005；NRP 2000；Logan 1991；Kivetz 2006；Nunes & Drèze 2006；Locke & Latham 2002
- 产品观察（2026-10）：Anki / Quizlet / Memrise / Duolingo / 墨墨背单词 / 不背单词
