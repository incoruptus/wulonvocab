"use client";

import { SkipForward, Star, Volume2 } from "lucide-react";
import type { Entry } from "@/lib/types";
import { speakWord } from "@/lib/study/tts";
import { CHOICE_OPTION_KEYS } from "@/lib/study/keymap";
import type { QuizQuestion } from "@/lib/study/quiz";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { CardActionButton } from "@/components/study/CardActionButton";
import { useResolvedTheme } from "@/components/app/Providers";
import { cx } from "@/lib/utils";

/**
 * 选择题卡片（四选一）：
 * - word2zh：正面显示单词 + 音标；zh2word / def2word：正面显示线索（隐藏词头，作答后揭晓）
 * - 词头可朗读、星标、跳过（稍后再次出现）；隐藏词头时朗读按钮在作答前不出现（避免泄底）
 * - 开启「稳 / 猜」时：答对后先确认再记分（空格 = 稳）
 * 桌面键位：W/E/I/O 直选（选中即判定），F/J 上一个 / 下一个词。
 */
export function ChoiceCard({
  entry,
  question,
  judged,
  chosen,
  starred,
  onToggleStar,
  onChoose,
  onSkip,
  confidencePending,
  onConfident,
}: {
  entry: Entry;
  question: QuizQuestion;
  judged: boolean;
  chosen: number | null;
  starred: boolean;
  onToggleStar: () => void;
  onChoose: (i: number) => void;
  onSkip: () => void;
  /** 答对后待确认「稳 / 猜」 */
  confidencePending?: boolean;
  onConfident?: (guessed: boolean) => void;
}) {
  const isDark = useResolvedTheme() === "dark";
  const pron = (entry.values["phonetic"] ?? {}) as { uk?: string; us?: string };
  const hideFront = Boolean(question.hideWord) && !judged;
  // 深色纸面：与 StudyCard 同一套适配（卡片底色 + 内部排版变量）
  const themeStyle: React.CSSProperties = isDark
    ? {
        color: "var(--ds-gray-1000)",
        ["--wv-fg" as string]: "var(--ds-gray-1000)",
        ["--wv-soft" as string]: "var(--ds-gray-900)",
        ["--wv-line" as string]: "var(--ds-gray-400)",
      }
    : { color: "#1b1b1b" };

  return (
    <div
      className={cx(
        "wv-card w-full max-w-xl rounded-2xl p-5 shadow-geist-md touch-manipulation sm:p-7",
        isDark ? "bg-gray-100" : "bg-white",
      )}
      style={{ fontSize: "12pt", lineHeight: 1.65, ...themeStyle }}
    >
      {/* 词头 / 线索：隐藏词头题型在作答前显示线索 */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        {hideFront ? (
          <div className="min-w-0">
            <div className="text-[0.72em] font-semibold uppercase tracking-[0.08em] text-[var(--wv-soft,#4b4b4b)]">
              {question.kind === "def2word" ? "读英英释义，选单词" : "读释义，选单词"}
            </div>
            <div className="mt-[0.45em] break-words text-[1.25em] font-medium leading-[1.5]">{question.clue}</div>
            {question.pos ? (
              <div className="mt-[0.4em] text-[0.85em] font-semibold text-[var(--wv-soft,#4b4b4b)]">{question.pos}</div>
            ) : null}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="break-words text-[1.85em] font-semibold leading-[1.15] tracking-[-0.02em]">{entry.headword}</div>
            {pron.uk || pron.us ? (
              <div className="wv-mono mt-[0.4em] flex flex-wrap gap-x-[1em] text-[0.85em] opacity-75">
                {pron.uk ? <span>英 {pron.uk}</span> : null}
                {pron.us ? <span>美 {pron.us}</span> : null}
              </div>
            ) : null}
            {question.pos ? <div className="mt-[0.4em] text-[0.85em] font-semibold text-[var(--wv-soft,#4b4b4b)]">{question.pos}</div> : null}
            {judged && question.hideWord && question.clue ? (
              <div className="mt-[0.4em] text-[0.78em] leading-[1.5] opacity-60">线索：{question.clue}</div>
            ) : null}
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!hideFront ? (
            <CardActionButton
              label="朗读单词（R）"
              hint="R"
              onClick={(e) => {
                e.stopPropagation();
                speakWord(entry.headword, pron.uk ? "en-GB" : "en-US");
              }}
            >
              <Volume2 className="size-5" />
            </CardActionButton>
          ) : null}
          <CardActionButton
            label={starred ? "取消星标（S）" : "加星标（S）"}
            hint="S"
            active={starred}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
          >
            <Star className="size-5" fill={starred ? "currentColor" : "none"} />
          </CardActionButton>
          {!judged ? (
            <CardActionButton
              label="跳过这个词（J，稍后再次出现）"
              hint="J"
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
            >
              <SkipForward className="size-5" />
            </CardActionButton>
          ) : null}
        </div>
      </div>

      {/* 选项 */}
      <div className="mt-[1em] space-y-2">
        {question.options.map((opt, i) => {
          const isCorrect = i === question.correctIndex;
          const isChosen = chosen === i;
          const stateClass = judged
            ? isCorrect
              ? "border-green-700/50 bg-green-800/10 text-green-900"
              : isChosen
                ? "border-red-700/50 bg-red-700/10 text-red-900"
                : "border-transparent bg-background-200 text-gray-800"
            : "border-transparent bg-background-200 text-gray-1000 hover:bg-gray-100";
          return (
            <button
              key={i}
              type="button"
              disabled={judged}
              onClick={() => onChoose(i)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-[1.5] transition-colors disabled:cursor-default",
                stateClass,
              )}
            >
              <span className="t-mono-12 grid size-6 shrink-0 place-items-center rounded-md bg-gray-1000/10 text-[11px] font-semibold">
                {"ABCD"[i]}
              </span>
              <span className="min-w-0 flex-1">{opt.text}</span>
              <span className="wv-desktop-only hidden shrink-0 sm:inline-flex">
                <Kbd>{CHOICE_OPTION_KEYS[i].toUpperCase()}</Kbd>
              </span>
            </button>
          );
        })}
      </div>

      {/* 「稳 / 猜」确认（答对后；空格 = 稳） */}
      {confidencePending ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-700/10 px-3.5 py-3">
          <span className="t-label-13 min-w-0 flex-1 text-amber-900">答对了。刚才是稳稳想起，还是猜中的？</span>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onConfident?.(false)}>
              稳 <span className="wv-desktop-only hidden sm:inline">（空格）</span>
            </Button>
            <Button size="sm" variant="tertiary" className="text-amber-900" onClick={() => onConfident?.(true)}>
              猜 · 记「模糊」
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
