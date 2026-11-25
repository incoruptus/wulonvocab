"use client";

import type { ReactNode } from "react";
import type { Wordbook } from "@/lib/types";
import { studyConfigOf } from "@/lib/study/queue";
import { DEFAULT_STUDY_CONFIG, type ChoiceTimeLimit, type StudyConfig } from "@/lib/study/types";
import { useAppStore } from "@/lib/store";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { StudyEngineHelp } from "@/components/study/StudyEngineHelp";
import { QuizModeControl } from "@/components/study/QuizModeControl";
import { Button } from "@/components/ui/button";
import { Field, Input, SwitchRow } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardTitle, SegmentedControl } from "@/components/ui/misc";

const CHOICE_TYPES = [
  { k: "word2def", label: "看词选英文释义", hint: "显示英文词，从四段英文解释中选对应义项" },
  { k: "word2zh", label: "看词选中文释义", hint: "显示单词，四选中文释义" },
  { k: "zh2word", label: "看中文释义选英文词", hint: "显示中文释义，四选单词；作答前不显示词头" },
  { k: "def2word", label: "看英文释义选英文词", hint: "显示英英释义，四选单词；缺英文释义时自动跳过" },
] as const;
const CHOICE_DURATIONS: ChoiceTimeLimit[] = [10, 15, 20, 25, 30];

function SettingsCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <CardTitle desc={desc}>{title}</CardTitle>
      <div className="border-t border-gray-300 pt-4">{children}</div>
    </Card>
  );
}

/** 词库工作区第三页：按词库生效的学习参数，仍写入同一个 Wordbook.study.config。 */
export function BookStudySettings({ book }: { book: Wordbook }) {
  const setStudyConfig = useAppStore((s) => s.setStudyConfig);
  const { pending, run } = useSyncCommit();
  const cfg = studyConfigOf(book);
  const choiceTimeLimits = cfg.choiceTimeLimits;
  const patch = (value: Partial<StudyConfig>) => run(() => setStudyConfig(book.id, value));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 pb-8 sm:p-5">
      <div className="flex items-start justify-between gap-3 px-0.5">
        <div>
          <h2 className="t-h-16 text-gray-1000">复习参数</h2>
          <p className="t-label-13 mt-1 text-gray-800">只对「{book.name}」生效，修改会随词库同步。</p>
        </div>
        <StudyEngineHelp />
      </div>

      <SettingsCard title="学习模式" desc="三种大题独立选择，或用「混搭」按比例安排。新词三步引入流程始终保留。">
        <QuizModeControl cfg={cfg} disabled={pending} onChange={patch} />
      </SettingsCard>

      <SettingsCard title="每日计划" desc="先安排复习，再按当天名额引入新词；未安排的词会顺延，不会删除。">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="每日新词上限" hint="新词首学完成后才占用名额">
            <Select
              value={String(cfg.newPerDay)}
              disabled={pending}
              onValueChange={(v) => patch({ newPerDay: Number(v) })}
              options={[5, 10, 15, 20, 30, 40, 60].map((n) => ({ value: String(n), label: `${n} 个` }))}
            />
          </Field>
          <Field label="每日复习上限" hint="积压不会被删除">
            <Select
              value={String(cfg.reviewPerDay)}
              disabled={pending}
              onValueChange={(v) => patch({ reviewPerDay: Number(v) })}
              options={[20, 50, 100, 150, 200, 300, 500].map((n) => ({ value: String(n), label: `${n} 个` }))}
            />
          </Field>
        </div>
        <SwitchRow
          label="按时间预算规划"
          hint="复习优先；时间不够时先减少新词，不改变记忆到期时间"
          checked={cfg.adaptivePlan !== false}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ adaptivePlan: v })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="每天可用时间">
            <Select
              value={String(cfg.dailyMinutes ?? 20)}
              disabled={pending}
              onValueChange={(v) => patch({ dailyMinutes: Number(v) })}
              options={[5, 10, 15, 20, 30, 45, 60, 90].map((n) => ({ value: String(n), label: `${n} 分钟` }))}
            />
          </Field>
          <Field label="目标日期（可选）" hint="考试或重要目标前两周会进一步少学新词">
            <Input type="date" value={cfg.examDate ?? ""} disabled={pending} onChange={(e) => patch({ examDate: e.target.value || undefined })} />
          </Field>
        </div>
        <SwitchRow
          label="弱词优先"
          hint="最近忘记、遗忘次数多或记忆强度低的词先出现，最多占本轮复习的 20%"
          checked={cfg.weakPriority !== false}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ weakPriority: v })}
        />
      </SettingsCard>

      <SettingsCard title="记忆与顺序" desc="只调整复习频率和队列表现，不修改已经保存的评分。">
        <div className="space-y-1.5">
          <div className="t-label-13 text-gray-900">记忆保持率</div>
          <SegmentedControl
            value={String(cfg.retention)}
            disabled={pending}
            onValueChange={(v) => patch({ retention: Number(v) })}
            options={[
              { value: "0.8", label: "0.80 轻松" },
              { value: "0.85", label: "0.85" },
              { value: "0.9", label: "0.90 推荐" },
              { value: "0.95", label: "0.95 严格" },
            ]}
            grow
          />
          <p className="t-label-12 text-gray-700">保持率越高，复习越频繁；0.90 适合大多数情况。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="新词引入顺序" hint="先排序，再取当天的新词名额">
            <Select
              value={cfg.newOrder}
              disabled={pending}
              onValueChange={(v) => patch({ newOrder: v as StudyConfig["newOrder"] })}
              options={[
                { value: "list", label: "词库顺序" },
                { value: "listDesc", label: "词库倒序" },
                { value: "az", label: "字母 A 到 Z" },
                { value: "azDesc", label: "字母 Z 到 A" },
                { value: "shuffle", label: "每次会话乱序" },
              ]}
            />
          </Field>
          <Field label="复习排序" hint="只改变顺序，不改变到期时间">
            <Select
              value={cfg.reviewOrder}
              disabled={pending}
              onValueChange={(v) => patch({ reviewOrder: v as StudyConfig["reviewOrder"] })}
              options={[
                { value: "due", label: "到期优先" },
                { value: "retrievability", label: "最可能忘的优先" },
              ]}
            />
          </Field>
        </div>
        <Field label="出题顺序">
          <SegmentedControl
            value={cfg.queueOrder}
            disabled={pending}
            onValueChange={(v) => patch({ queueOrder: v as "due" | "shuffle" })}
            options={[
              { value: "due", label: "到期优先" },
              { value: "shuffle", label: "随机乱序" },
            ]}
            grow
          />
        </Field>
      </SettingsCard>

      <SettingsCard title="选择题" desc="四个子型统一四选一、限时作答；选项凑不够的词会回退熟悉度自评。">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="t-label-12 text-gray-700">当前启用 {cfg.choiceTypes.length} / 4 个子型；新词首学验证仍固定为看词选中文释义。</p>
          <Button size="sm" variant="secondary" disabled={pending || cfg.choiceTypes.length === 4} onClick={() => patch({ choiceTypes: ["word2def", "word2zh", "zh2word", "def2word"] })}>
            启用四子型
          </Button>
        </div>
        <Field label="推进方式">
          <SegmentedControl
            value={cfg.choiceAdvance}
            disabled={pending || cfg.choiceConfidence}
            onValueChange={(v) => patch({ choiceAdvance: v })}
            options={[
              { value: "auto", label: "自动下一题" },
              { value: "continue", label: "按「继续」推进" },
            ]}
            grow
          />
        </Field>
        <div className="divide-y divide-gray-300">
          {CHOICE_TYPES.map(({ k, label, hint }) => (
            <SwitchRow
              key={k}
              label={label}
              hint={hint}
              checked={cfg.choiceTypes.includes(k)}
              loading={pending}
              disabled={pending || (cfg.choiceTypes.length === 1 && cfg.choiceTypes.includes(k))}
              onCheckedChange={(v) => patch({ choiceTypes: v ? [...cfg.choiceTypes, k] : cfg.choiceTypes.filter((x) => x !== k) })}
            />
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="t-label-13 font-medium text-gray-900">各子型作答时间</div>
              <p className="t-label-12 mt-0.5 text-gray-700">分别调整难度；页面隐藏或打开弹层时暂停。</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => patch({ choiceTimeLimits: { ...DEFAULT_STUDY_CONFIG.choiceTimeLimits } })}
            >
              恢复默认时长
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHOICE_TYPES.map(({ k, label }) => (
              <Field key={k} label={`${label}时限`}>
                <Select
                  value={String(choiceTimeLimits[k])}
                  disabled={pending}
                  onValueChange={(v) => patch({
                    choiceTimeLimits: { ...choiceTimeLimits, [k]: Number(v) as ChoiceTimeLimit },
                  })}
                  options={CHOICE_DURATIONS.map((seconds) => ({ value: String(seconds), label: `${seconds} 秒` }))}
                />
              </Field>
            ))}
          </div>
        </div>
        <SwitchRow
          label="答对后询问「稳 / 猜」"
          hint="选中「猜」记「模糊」，比一律记「记得」更贴近真实记忆"
          checked={cfg.choiceConfidence}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ choiceConfidence: v })}
        />
        <SwitchRow
          label="允许 AI 生成选择题"
          hint="默认关闭。公共题库与词条字段不足时按需调用已配置的 AI，生成题校验后缓存于本机"
          checked={cfg.aiWordQuiz === true}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ aiWordQuiz: v })}
        />
      </SettingsCard>

      <SettingsCard title="Cloze" desc="从词条真实例句中挖空，缺例句时允许 AI 补句；没有可用句子时回退自评。">
        <SwitchRow
          label="启用例句挖空"
          hint="独立 Cloze 模式会自动开启；关闭后混搭中的 Cloze 份额也会回退自评"
          checked={cfg.clozeEnabled !== false}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ clozeEnabled: v })}
        />
        <SwitchRow
          label="稳定期使用拼写题"
          hint="仅在独立 Cloze 模式启用；按释义拼写，首次提交定终身"
          checked={cfg.spellEnabled === true}
          loading={pending}
          disabled={pending || cfg.quizMode !== "cloze"}
          onCheckedChange={(v) => patch({ spellEnabled: v })}
        />
        <SwitchRow
          label="缺例句时允许 AI 补句"
          hint="默认关闭。生成句通过短句规则后使用，并缓存在本机"
          checked={cfg.aiCloze === true}
          loading={pending}
          disabled={pending || !cfg.clozeEnabled}
          onCheckedChange={(v) => patch({ aiCloze: v })}
        />
      </SettingsCard>

      <SettingsCard title="辅助规则" desc="减少易混词干扰，并给反复忘记的词一个明确处置入口。">
        <SwitchRow
          label="相似词避让"
          hint="形近、义近的词分开放；想集中练易混组时可在学习首页开「本场允许相似词」"
          checked={cfg.similarityAvoid}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ similarityAvoid: v })}
        />
        <SwitchRow
          label="自动发音"
          hint="熟悉度自评在卡片出现时朗读；其他模式在判定后朗读，避免提前泄露答案"
          checked={cfg.autoSpeak}
          loading={pending}
          disabled={pending}
          onCheckedChange={(v) => patch({ autoSpeak: v })}
        />
        <Field label="顽固词阈值" hint="达到一半会提前提醒；达到阈值后可搁置、改卡或降级重学">
          <Select
            value={String(cfg.leechThreshold)}
            disabled={pending}
            onValueChange={(v) => patch({ leechThreshold: Number(v) })}
            options={[6, 8, 10, 12, 16, 20].map((n) => ({ value: String(n), label: `${n} 次${n === 8 ? "（推荐）" : ""}` }))}
          />
        </Field>
      </SettingsCard>
    </div>
  );
}
