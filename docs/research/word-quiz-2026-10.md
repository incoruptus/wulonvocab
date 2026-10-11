# 外教式 Word Quiz（线索选词 / 选句）· 调研与设计（2026-10）

> 来源：调研子代理报告（仅调研，无代码改动）。标签：**【事实】**=代码或已核验来源；**【推断】**=分析判断。
> 产品方原始需求：① 给一句与该词有关的话（英英释义 / 名词功能用途 / 其他线索），四词选一词；② 给一个词，四句话中选一句。

## 一、结论摘要

1. 【事实+推断】题型 A（线索→词）测「识别 + 线索回忆」（接受性），题型 B（词→句）测使用面（搭配/介词/词性/语域）的产出性知识；B 显著难于 A（Nation 词知识模型；Laufer & Goldstein 四档层级）。
2. 【事实】主流考试与头部产品**都没有**「一个词配四个句子选正确句」的成熟题型；最接近的成熟形态是「语境挖空选词」（Cambridge A2 Key Part 4、B1 Preliminary Part 5；Vocabulary.com Fill in the Blank；Clozemaster）。
3. 【推断】题型 B 最大风险是「标记的错句其实也可接受」（标错）。可控解法：干扰句只允许 AI 合成且每句绑定**唯一错因标签**、生成后自检、无法自检就不出题，降级为「真实例句挖空」。
4. 【推断】数据面足够支撑题型 A 大面积出题：`translation` 覆盖最高（可做中→英反向），`definition/examples` 按来源在 30%–80%；题型 B 无 AI 时基本无法出题，唯二例外是手写 `pitfall/notes` 错例与例句挖空。
5. 【推断】生成物走「本机缓存、不入主 store、不进同步载荷」（同 `lookup/cache.ts` 模式），按 `entry.updatedAt + 模型 + 提示词版本` 失效。
6. 【推断】建议分期：先做无 AI 的题型 A 扩展（2–3 人日），再做 AI 生成管线（3–5），题型 B 最后且默认关闭（4–6）；合计 11–17 人日。

## 二、题型 A（线索→词）最优实现提案

### 触发条件
- 沿用 `StudyConfig.quizMode` 总开关；新增子配置 `choiceTypes`，缺省 `["word2zh"]` 向后兼容。
- 按卡过滤：数据不满足必要条件不生成，回退链 `A → EN→ZH（现状）→ 翻卡`。

### 数据来源优先级（逐级降级）
| 优先 | 线索类型 | 来源字段 | 无 AI 可用性 |
|---|---|---|---|
| 1 | 英英释义 | `senses[].definition` | 高 |
| 2 | 中文释义反转（选英文词） | `senses[].translation` | **最高（≈全量）** |
| 3 | 例句语境挖空 | `examples / examplesExtra` | 中（需歧义过滤） |
| 4 | 典型搭配/句型改写 | `collocations / patterns` | 低（含目标词需改写） |
| 5 | 名词功能/上位词 | 无现成字段 | ≈0（AI 或 WordNet 式数据） |

- 线索若含目标词（例句/搭配）必须先挖空或改写为不含目标词及派生形的描述；AI 改写用「定义词汇约束」（LDOCE 风格 2000 常用词）控难度。

### 生成/降级
- 无 AI 只用 1/2/3；干扰词同书取（复用 `quiz.ts` 同词性优先、`isBad` 过滤、长度接近、种子洗牌）。
- 有 AI：4/5 与缺失字段按需生成；单卡按需 + 预取下一张；失败静默回退不阻塞会话。

### 交互与键位
- 与现选择题**完全同构**：W/E/I/O 直选，F/J 跳词，空格继续，R/S/U/?/Esc 不变。
- 差异：正面显示线索（不显示目标词）；**`autoSpeak` 在此模式必须关闭**（朗读即泄底）；判定后显示词形音标，方可朗读。
- 错误页：正确答案（词形+音标+义项）、逐项一行错因、线索与义项对应、「打开词条」。

### 判定规则（唯一性）
三级校验：词性一致 → 排除相等/包含 → 英文线索下实词重合阈值；AI 线索要求逐项给「为什么不符合」；提供「这题有两个答案？」举报入口（举报即隔离该题，本次作答按「记得」软判，**需拍板**）。

### 评分映射
答对 → Good(3)；答错 → Again(1)；争议举报 → 撤销为 Good 并隔离。**不做 Easy(4)**（选择题自信度噪声，4 档保留翻卡）。

## 三、题型 B（词→句）最优实现提案

### 触发条件
- SRS 门槛：`state===Review && reps ≥ 3 && scheduledDays ≥ 4`，且词条有可核验用法资料或有 AI；否则不出。
- 每词条生成 1 题、题目轮换；默认实验开关关闭（**需拍板**）。

### 受控形态（按可控性排序，建议默认 B1）
1. **B1 单错判定（默认）**：1 正确句 + 3 个各含**唯一可命名错误**的 AI 合成句；正确句优先真实例句（是否改用新撰句**需拍板**）。
2. **B2 真实例句挖空（最可控替代）**：`examples` 一句挖掉目标词，四选一填词；无法保证「唯一可填」就不出题。
3. **B3 改错**：给错句，四选一指出「错在哪里」（比「哪句对」更可验证），作为 B1 自检失败的降级。

### 错误类型学（每句绑定：标签 + 中文一行解释 + 修正句）
| 标签 | 自撰示意 | 来源 |
|---|---|---|
| 搭配错误 | ✗ make a photo（应为 take） | `collocations`、AI |
| 及物性/介词 | ✗ explain me the rule（explain sth to sb） | `patterns`、AI |
| 词性/词形误用 | ✗ a success businessman（successful） | `transforms/family`、AI |
| 语义转移（L1 迁移） | ✗ open the light（turn on） | AI（注明典型错误） |
| 语域错误 | 学术句里 kinda/gonna | `contexts`、AI |
| 可数/限定 | ✗ many equipments | AI |

### 「错得可信且可验证」的生成与过滤
- 干扰句**只允许 AI 合成**（真实语料可能含可接受变体）；提示词要求逐句输出 `errorType + whyWrong + fixed`，再做自检（任一句在常见语境下也正确则重写）。
- 本地复检：四句都含目标词（含屈折）；互不重复；无专有名词；长度接近、8–16 词；选项同质、单最优（NBME/Haladyna 出题规则）。
- 任一不通过 → 不出题，降级 B2 / 翻卡。

### 交互与评分
- 正面：词形+音标（**可朗读**）；四句 A-D；W/E/I/O 选句；180ms 输入锁与「答错必停留」沿用。
- 可选第三路径「不确定」：可见答案记 Hard(2)（**需拍板**）。
- 判定后：正确句 ✓、所错句 ✗ + 错因标签 + 修正句；其余干扰句逐句标注（B 的核心学习价值）。
- 映射：对 → Good(3)；错 → Again(1)；不确定 → Hard(2)。

## 四、分节依据（要点）

1. **教学法**：Nation 形/义/用 × 接受/产出；Laufer & Goldstein 四档（passive recognition < active recognition < passive recall < active recall）；Webb 2005 搭配产出显著弱于接受；提取练习/生成效应支持「主动提取优于重复阅读」。
2. **题型 A 线索学**：见二表；词族线索容易泄底，列低优先。
3. **题型 B 标错风险**：可接受变体/歧义语境/错因不唯一 → 单错标签 + 自检 + 举报 + 不确定就不出；MCQ 出题规则（NBME / Haladyna & Downing 1989）。
4. **数据与管线**：
   - 题型 A 无 AI 可出题估计 **60%–90%**（中文线索保底）；题型 B 无 AI ≈0，B2 挖空 40%–70%。
   - AI 提示词：单卡小批（1 词 1 题或 4–6 词/批）；严格 JSON 经 `extractJsonText`；系统提示**字节稳定**；明确自撰、不得复制原文；线索词限常用 2000 词；难度按 `book.meta.level`；词条内容当数据并声明忽略其中指令；低温度；解析后本地归一化与过滤。
   - 缓存：独立 IDB（如 `wulonvocab-quiz-cache`），key=`entryId::entry.updatedAt::model::promptVersion::type`；LRU ≤5MB；**不进同步载荷**（B 题每条约 0.4–0.7KB，2000 词≈1MB；Gist 分片阈值 460KB 不可上调）。
   - 无 AI 降级：主力「中→英选词」+「英英线索选词」；B 仅 B2；失败静默回退。
5. **判定与评分**：见二/三；不做程度判定（二值化才可验证）。
6. **已有案例可迁移**：Vocabulary.com（10 题型 + Assessment/Review 分层 + 错题回炉）；Clozemaster（真实句挖空 + 词频阶梯）；Cambridge A2/B1 multiple-choice cloze；Quizlet（同表取干扰项）；Anki MC 插件（Kprim 多错因思路）；WaniKani（Recent Mistakes / 练习不计分）；教材改错题（Common Mistakes 基于学习者语料）。
7. **难度与阶段**：新词首见仍翻卡；学习期 = A 族（词→义 → 中→英 → 英英线索 → 例句挖空）；Review reps≥3 可引入 B；混合策略建议「学习中=A，复习中=B1/B2」。

## 五、复用落点（文件级）

| 文件 | 方向 |
|---|---|
| `src/lib/study/quiz.ts` | 抽题池/洗牌/`isBad` 公用化；新增 `buildClueQuestion`（A）、`buildUsageQuestion`（B1/B2 校验与过滤）；保持纯函数 |
| `src/components/study/ChoiceCard.tsx` | 泛化 props（`clue?` 隐藏词头 / `sentences?`）；判定配色与字母徽标原样保留 |
| `src/components/study/StudySession.tsx` | 出题改「题型策略函数」；判分映射/冻结/180ms 锁/`choiceAdvance` 全复用；隐藏词头模式禁 `autoSpeak` |
| `src/lib/study/types.ts` | 新增 `choiceTypes` 等子配置 + 缺省合并（同步域经 `setStudyConfig` 立即上云） |
| `src/lib/study/keymap.ts` | 沿用 W/E/I/O；帮助弹窗随模式追加 |
| `src/lib/lookup/ai.ts` / `extractJsonText` | 复用为生成调用层；提示词另建文件（建议 `lib/study/quizgen.ts`） |
| 新 `src/lib/study/quizCache.ts` | 仿 `lookup/cache.ts`：独立 IDB、指纹失效、LRU、清空入口 |
| `study.test.ts` 等 | 题型生成/校验/缓存单测（改核心库必跑 `npm test`） |

## 六、复杂度、风险与开放问题

| 阶段 | 内容 | 人日【推】 |
|---|---|---|
| P0 | 题型 A 无 AI 扩展（中→英反向、英英线索、回退链） | 2–3 |
| P1 | AI 生成管线（提示词、校验器、缓存、预取、降级） | 3–5 |
| P2 | 题型 B（B1 + B2 + 错因反馈 + 举报隔离） | 4–6 |
| P3 | 排布策略/门槛、设置文案、帮助键位、文档测试 | 2–3 |

**风险**：标错（信任风险，四道闸）；AI 成本/超时/模型差异；提示词注入与版权红线；选择题偏易致 FSRS 间隔虚长（需真机校准）；生成物跨端差异属预期；B 的长句选项移动端排版须沿用「原位切换不位移」约定。

**开放问题（需拍板）**
1. 题型 B 定稿形态：B1/B2/B3 还是按数据自动择优？
2. 是否引入「不确定」（记 Hard）？
3. 生成物是否需要跨端一致（建议否）？
4. B1 正确句用真实例句还是 AI 新撰句？
5. 默认开启还是实验开关（设置项文案）？
6. 选择题答对可否升级 Easy(4)？
7. AI 失败时的提示口径（建议静默回退 + 一次轻提示）。

## 来源清单（已核验 URL）

- S1 Cambridge A2 Key exam format（Part 4 multiple-choice cloze）— https://www.cambridgeenglish.org/exams-and-tests/key/exam-format/
- S2 Cambridge B1 Preliminary exam format（Reading Part 5）— https://www.cambridgeenglish.org/exams-and-tests/preliminary/exam-format/
- S3 Laufer & Goldstein 2004, *Language Learning* 54(3)（四档层级）
- S4 Vocabulary.com Help（Question Types and Modes）— https://www.vocabulary.com/help/the-basics/question-types-and-modes/
- S5 Clozemaster — https://www.clozemaster.com/
- S6 AnkiWeb「Multiple Choice for Anki」add-on（code 1566095810）
- S7 Quizlet Help — https://help.quizlet.com/
- S8 LDOCE About（2000 常用词释义）— https://www.ldoceonline.com/about.html
- S19 WaniKani Knowledge（Reviews / Extra Study）— https://knowledge.wanikani.com/getting-started/first-reviews/

**标准文献（学界通行引用）**：Nesselhauf 2003 *Applied Linguistics*；Laufer & Waldman 2011 *Language Learning*；Cambridge Common Mistakes 系列；NBME（Case & Swanson 2002）；Haladyna & Downing 1989；Roediger & Karpicke 2006；Karpicke & Roediger 2008；Slamecka & Graf 1978；Webb 2005；Miller 1995（WordNet）；English Vocabulary in Use；EVP / Oxford 3000/5000；Nation 2013 *Learning Vocabulary in Another Language*（2nd ed.）。
