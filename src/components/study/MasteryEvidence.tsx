"use client";

import { hasMasteryEvidence, masteryOf, type MasteryDimension, type MasteryEvidence, type MasteryIndex } from "@/lib/study/mastery";
import { cx } from "@/lib/utils";

const DIMENSIONS: { key: MasteryDimension; label: string; hint: string }[] = [
  { key: "recognition", label: "再认", hint: "看词选义" },
  { key: "recall", label: "回忆", hint: "看词说义 / 看义选词" },
  { key: "production", label: "产出", hint: "拼写 / 口述" },
];

const RATING_LABEL = { 1: "忘记", 2: "模糊", 3: "记得", 4: "轻松" } as const;

function toneOf(evidence: MasteryEvidence): string {
  if (evidence.attempts === 0) return "bg-gray-100 text-gray-700";
  if (evidence.successes === 0) return "bg-amber-700/10 text-amber-900";
  return "bg-blue-100 text-blue-1000";
}

/** 三条独立证据，不折算成综合分。紧凑模式只在有本机记录时出现。 */
export function MasteryEvidence({
  entryId,
  index,
  detailed = false,
}: {
  entryId: string;
  index: MasteryIndex;
  detailed?: boolean;
}) {
  const mastery = masteryOf(index, entryId);
  if (!detailed && !hasMasteryEvidence(mastery)) return null;

  if (!detailed) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5" aria-label="本机掌握层次">
        {DIMENSIONS.filter(({ key }) => mastery[key].attempts > 0).map(({ key, label }) => (
          <span key={key} className={cx("rounded px-1.5 py-0.5 t-label-12", toneOf(mastery[key]))} title={`${label}：成功 / 作答次数`}>
            {label} {mastery[key].successes}/{mastery[key].attempts}
          </span>
        ))}
      </div>
    );
  }

  return (
    <section aria-label="掌握层次" className="rounded-xl bg-background-100 p-3.5 shadow-geist-border">
      <div className="flex items-center justify-between gap-3">
        <div className="t-label-13 font-medium text-gray-900">掌握层次</div>
        <span className="t-label-12 text-gray-700">本机派生</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {DIMENSIONS.map(({ key, label, hint }) => (
          <DimensionCell key={key} label={label} hint={hint} evidence={mastery[key]} />
        ))}
      </div>
      <p className="t-label-12 mt-3 text-gray-700">
        每层只取每个学习会话的首次评分，最多回顾最近 20 次；撤销不计。这里不参与同步，也不改变 FSRS 调度。
      </p>
    </section>
  );
}

function DimensionCell({ label, hint, evidence }: { label: string; hint: string; evidence: MasteryEvidence }) {
  return (
    <div className="min-w-0 rounded-lg bg-background-200 p-2.5" data-mastery-dimension={label}>
      <div className="t-label-13 font-medium text-gray-1000">{label}</div>
      <div className="t-label-12 mt-0.5 truncate text-gray-700" title={hint}>{hint}</div>
      <div className={cx("t-label-13 mt-2 tabular-nums", toneOf(evidence))}>
        {evidence.attempts > 0 ? `${evidence.successes} / ${evidence.attempts} 次成功` : "未验证"}
      </div>
      {evidence.lastRating ? <div className="t-label-12 mt-0.5 text-gray-700">最近：{RATING_LABEL[evidence.lastRating]}</div> : null}
    </div>
  );
}
