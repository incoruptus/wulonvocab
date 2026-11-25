"use client";

import { useRef, useState } from "react";
import { Eye, SkipForward, Star, Volume2 } from "lucide-react";
import type { Entry } from "@/lib/types";
import type { ProductionGrade, ProductionQuestion } from "@/lib/study/production";
import { productionSegments } from "@/lib/study/production";
import { speakWord } from "@/lib/study/tts";
import { CardActionButton } from "@/components/study/CardActionButton";
import { Kbd } from "@/components/ui/misc";
import { cx } from "@/lib/utils";

export function ProductionCard({
  entry,
  question,
  value,
  judged,
  result,
  starred,
  onValueChange,
  onSubmit,
  onToggleStar,
  onSkip,
}: {
  entry: Entry;
  question: ProductionQuestion;
  value: string;
  judged: boolean;
  result: ProductionGrade | null;
  starred: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onToggleStar: () => void;
  onSkip: () => void;
}) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const segments = productionSegments(question);
  const pron = (entry.values["phonetic"] ?? {}) as { uk?: string };

  return (
    <div className="wv-card w-full max-w-xl rounded-2xl bg-background-100 p-5 shadow-geist-md sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-label-12 font-medium uppercase tracking-[0.08em] text-gray-700">
            {question.kind === "cloze" ? "例句挖空 · Cloze" : "拼写 · Spelling"}
          </div>
          <div className="t-label-13 mt-1 text-gray-800">{question.prompt}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {judged ? (
            <CardActionButton
              label="朗读单词"
              onClick={() => speakWord(entry.headword, pron.uk ? "en-GB" : "en-US")}
            >
              <Volume2 className="size-5" />
            </CardActionButton>
          ) : null}
          <CardActionButton
            label={starred ? "取消星标" : "加星标"}
            active={starred}
            onClick={onToggleStar}
          >
            <Star className="size-5" fill={starred ? "currentColor" : "none"} />
          </CardActionButton>
          {!judged ? (
            <CardActionButton label="跳过这个词" onClick={onSkip}>
              <SkipForward className="size-5" />
            </CardActionButton>
          ) : null}
        </div>
      </div>

      {question.kind === "cloze" && segments ? (
        <div className="mt-6 text-[19px] leading-[1.9] text-gray-1000 sm:text-[22px]">
          {judged ? (
            <>
              {segments.before}
              <span className={cx("mx-1 inline-block rounded-md px-2 py-0.5 font-semibold", result?.exact ? "bg-green-800/10 text-green-900" : "bg-amber-700/15 text-amber-900")}>
                {question.answer}
              </span>
              {segments.after}
            </>
          ) : (
            <>{segments.before}<span className="mx-1 inline-block min-w-20 border-b-2 border-gray-500 pb-0.5 text-center font-mono text-gray-700">_____</span>{segments.after}</>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          <div className="text-[20px] font-medium leading-[1.6] text-gray-1000 sm:text-[23px]">
            {judged ? entry.headword : question.clue}
          </div>
          {!judged ? (
            <div className="t-mono-13 text-gray-700">
              {entry.headword[0]?.toLowerCase()} {"_".repeat(Math.max(1, entry.headword.length - 1))} · {entry.headword.length} 个字母
            </div>
          ) : null}
          {judged && question.clue ? <div className="t-label-13 text-gray-800">释义：{question.clue}</div> : null}
        </div>
      )}

      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (composingRef.current || judged) return;
          onSubmit();
        }}
      >
        <label htmlFor="production-answer" className="t-label-13 block font-medium text-gray-900">
          {judged ? "你的答案" : "填写答案"}
        </label>
        <input
          id="production-answer"
          value={value}
          disabled={judged}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            setComposing(false);
            onValueChange(event.currentTarget.value);
          }}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          className="h-12 w-full rounded-xl border border-gray-400 bg-background-100 px-4 text-[18px] text-gray-1000 outline-none transition-shadow placeholder:text-gray-700 focus:border-blue-700 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-focus-color)_16%,transparent)] disabled:bg-gray-100"
          placeholder={composing ? "正在输入…" : question.kind === "cloze" ? "填出空缺单词" : "输入完整单词"}
          aria-describedby="production-answer-hint"
        />
        <div id="production-answer-hint" className="t-label-12 text-gray-700">
          {judged
            ? result?.exact
              ? "拼写正确"
              : result?.distance === 1
                ? "只差一个字符，记「模糊」"
                : "这次没能想起，记「忘记」"
            : "首次提交定终身；提交后只显示反馈，不改写评分。"}
        </div>
        {!judged ? (
          <button
            type="submit"
            disabled={!value.trim() || composing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-1000 text-[15px] font-medium text-background-100 transition-colors hover:bg-gray-900 disabled:bg-gray-300 disabled:text-gray-700"
          >
            提交答案 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">Enter</Kbd>
          </button>
        ) : null}
      </form>

      {judged ? (
        <div className="mt-4 space-y-2 border-t border-gray-300 pt-4">
          <div role="status" className={cx("t-label-13", result?.exact ? "text-green-900" : result?.distance === 1 ? "text-amber-900" : "text-red-900")}>
            {result?.exact ? "回答正确" : result?.distance === 1 ? `只差一个字符，正确答案是 ${question.answer}` : `正确答案是 ${question.answer}`}
          </div>
          {question.kind === "cloze" && question.translation ? (
            <button type="button" onClick={() => setShowTranslation((value) => !value)} className="t-label-13 inline-flex items-center gap-1.5 text-blue-900 hover:underline">
              <Eye className="size-3.5" /> {showTranslation ? "收起中文" : "显示中文翻译"}
            </button>
          ) : null}
          {showTranslation ? <p className="t-label-13 text-gray-800">{question.translation}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
