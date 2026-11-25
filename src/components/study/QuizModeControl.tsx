"use client";

import { RotateCcw } from "lucide-react";
import { DEFAULT_STUDY_CONFIG, type ChoiceMixWeights, type QuizMixWeights, type StudyConfig } from "@/lib/study/types";
import { mixPercentages, quizMixOf, choiceMixOf } from "@/lib/study/quizMix";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/misc";
import { Slider } from "@/components/ui/field";

function WeightSlider({
  label,
  value,
  total,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  total: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label-13 text-gray-900">{label}</span>
        <span className="t-mono-12 text-gray-800">{total ? Math.round(value / total * 100) : 0}%</span>
      </div>
      <Slider min={0} max={100} step={5} value={[value]} disabled={disabled} onValueChange={([next]) => onChange(next)} ariaLabel={`${label}占比`} />
    </div>
  );
}

export function QuizMixControls({
  cfg,
  disabled,
  onChange,
}: {
  cfg: StudyConfig;
  disabled?: boolean;
  onChange: (patch: Partial<StudyConfig>) => void;
}) {
  const families = quizMixOf(cfg);
  const familyTotal = families.flip + families.choice + families.cloze;
  const kinds = choiceMixOf(cfg);
  const kindTotal = Object.values(kinds).reduce((sum, value) => sum + value, 0);
  const setFamily = (key: keyof QuizMixWeights, value: number) => onChange({ quizMixWeights: { ...families, [key]: value } });
  const setKind = (key: keyof ChoiceMixWeights, value: number) => onChange({ choiceMixWeights: { ...kinds, [key]: value } });
  const percentages = mixPercentages(families);

  return (
    <div className="space-y-4 rounded-lg bg-background-100 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="t-label-13 font-medium text-gray-900">混搭比例</div>
          <p className="t-label-12 mt-0.5 text-gray-700">按比例平滑轮转；某题缺数据时只回退该题，不改变其他题。</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange({ quizMixWeights: { ...DEFAULT_STUDY_CONFIG.quizMixWeights! }, choiceMixWeights: { ...DEFAULT_STUDY_CONFIG.choiceMixWeights! } })}
        >
          <RotateCcw className="size-3.5" /> 重置
        </Button>
      </div>
      <div className="space-y-3">
        <WeightSlider label="熟悉度自评" value={families.flip} total={familyTotal} disabled={disabled} onChange={(v) => setFamily("flip", v)} />
        <WeightSlider label="选择题" value={families.choice} total={familyTotal} disabled={disabled} onChange={(v) => setFamily("choice", v)} />
        <WeightSlider label="Cloze" value={families.cloze} total={familyTotal} disabled={disabled} onChange={(v) => setFamily("cloze", v)} />
      </div>
      {!familyTotal ? <p className="t-label-12 text-amber-900">当前没有启用任何大题，实际会全部使用熟悉度自评。</p> : null}
      <div className="border-t border-gray-300 pt-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="t-label-13 font-medium text-gray-900">选择题内部比例</div>
          <span className="t-label-12 text-gray-700">选择题合计约 {percentages.choice ?? 0}%</span>
        </div>
        <div className="space-y-3">
          <WeightSlider label="看词选英文释义" value={kinds.word2def} total={kindTotal} disabled={disabled} onChange={(v) => setKind("word2def", v)} />
          <WeightSlider label="看英文释义选英文词" value={kinds.def2word} total={kindTotal} disabled={disabled} onChange={(v) => setKind("def2word", v)} />
          <WeightSlider label="看中文释义选英文词" value={kinds.zh2word} total={kindTotal} disabled={disabled} onChange={(v) => setKind("zh2word", v)} />
          <WeightSlider label="看词选中文释义" value={kinds.word2zh} total={kindTotal} disabled={disabled} onChange={(v) => setKind("word2zh", v)} />
        </div>
        {!kindTotal && families.choice > 0 ? <p className="t-label-12 mt-2 text-amber-900">选择题子型权重均为 0，实际会使用当前阶段可用的子型。</p> : null}
      </div>
    </div>
  );
}

export function QuizModeControl({
  cfg,
  disabled,
  onChange,
  compact = false,
}: {
  cfg: StudyConfig;
  disabled?: boolean;
  onChange: (patch: Partial<StudyConfig>) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <div className="t-label-13 font-medium text-gray-900">学习模式</div>
      <SegmentedControl<StudyConfig["quizMode"]>
        value={cfg.quizMode}
        disabled={disabled}
        onValueChange={(quizMode) => onChange({ quizMode, ...(quizMode === "cloze" ? { clozeEnabled: true } : {}) })}
        options={[
          { value: "flip", label: "熟悉度自评" },
          { value: "choice", label: "选择题" },
          { value: "cloze", label: "Cloze" },
          { value: "mix", label: "混搭" },
        ]}
        grow
        size={compact ? "sm" : "md"}
      />
      <p className="t-label-12 leading-5 text-gray-700">
        {cfg.quizMode === "flip" ? "先回忆，再翻面对照评级，不受其他题型开关影响。" : null}
        {cfg.quizMode === "choice" ? "使用四个选择题子型，限时四选一；选项不足时回退自评。" : null}
        {cfg.quizMode === "cloze" ? "独立使用例句挖空；新词仍走三步引入，缺例句时可回退自评。" : null}
        {cfg.quizMode === "mix" ? "三类大题与四个选择题子型都可调比例，按本场题序平滑轮转。" : null}
      </p>
      {cfg.quizMode === "mix" ? <QuizMixControls cfg={cfg} disabled={disabled} onChange={onChange} /> : null}
    </div>
  );
}
