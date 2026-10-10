"use client";

import { SkipForward, Star, Volume2 } from "lucide-react";
import type { Entry } from "@/lib/types";
import { speakWord } from "@/lib/study/tts";
import { CHOICE_OPTION_KEYS } from "@/lib/study/keymap";
import type { QuizQuestion } from "@/lib/study/quiz";
import { Kbd } from "@/components/ui/misc";
import { CardActionButton } from "@/components/study/CardActionButton";
import { cx } from "@/lib/utils";

/**
 * 选择题卡片（看词选义）：
 * 正面即显示单词 + 音标，下方四个释义选项；词头可朗读、星标、跳过（稍后再次出现）。
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
}: {
  entry: Entry;
  question: QuizQuestion;
  judged: boolean;
  chosen: number | null;
  starred: boolean;
  onToggleStar: () => void;
  onChoose: (i: number) => void;
  onSkip: () => void;
}) {
  const pron = (entry.values["phonetic"] ?? {}) as { uk?: string; us?: string };

  return (
    <div className="wv-card w-full max-w-xl rounded-2xl bg-white p-5 shadow-geist-md sm:p-7" style={{ fontSize: "12pt", lineHeight: 1.65, color: "#1b1b1b" }}>
      {/* 词头：长词放不下时操作按钮整行落到词下（右对齐），避免单词被挤断行 */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="break-words text-[1.85em] font-semibold leading-[1.15] tracking-[-0.02em]">{entry.headword}</div>
          {pron.uk || pron.us ? (
            <div className="wv-mono mt-[0.4em] flex flex-wrap gap-x-[1em] text-[0.85em] opacity-75">
              {pron.uk ? <span>英 {pron.uk}</span> : null}
              {pron.us ? <span>美 {pron.us}</span> : null}
            </div>
          ) : null}
          {question.pos ? <div className="mt-[0.4em] text-[0.85em] font-semibold text-[var(--wv-soft,#4b4b4b)]">{question.pos}</div> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
              <span className="t-mono-12 grid size-6 shrink-0 place-items-center rounded-md bg-black/5 text-[11px] font-semibold">
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
    </div>
  );
}
