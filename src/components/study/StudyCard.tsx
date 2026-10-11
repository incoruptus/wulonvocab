"use client";

import { Star, Volume2 } from "lucide-react";
import type { Entry, ExportSettings, Wordbook } from "@/lib/types";
import { isValueEmpty, sortSections } from "@/lib/sections";
import { SectionBlock, accentCssVar, type CardCtx } from "@/components/export/blocks";
import { speakWord } from "@/lib/study/tts";
import { CardActionButton } from "@/components/study/CardActionButton";
import { useResolvedTheme } from "@/components/app/Providers";
import { cx } from "@/lib/utils";

/** 学习卡片：正面（单词 + 音标 + 发音）→ 轻点翻面显示释义与例句 */
export function StudyCard({
  book,
  entry,
  revealed,
  onReveal,
  starred,
  onToggleStar,
}: {
  book: Wordbook;
  entry: Entry;
  revealed: boolean;
  onReveal: () => void;
  starred: boolean;
  onToggleStar: () => void;
}) {
  const isDark = useResolvedTheme() === "dark";
  const s = book.exportSettings;
  const ctxSettings: ExportSettings = {
    ...s,
    cardStyle: "swiss",
    showSectionLabels: true,
    hideEmpty: true,
    writingLines: 0,
    fontScale: Math.max(1, s.fontScale),
  };
  const ctx: CardCtx = { settings: ctxSettings, schema: book.schema };
  const sections = sortSections(book.schema.sections)
    .filter((sec) => sec.type !== "pronunciation") // 卡头已展示音标，避免重复
    .filter((sec) => !isValueEmpty(sec.type, entry.values[sec.key]));
  const pron = (entry.values["phonetic"] ?? {}) as { uk?: string; us?: string };
  // 深色纸面：卡片容器与内部排版变量整体切到暗色（亮色纸感仅在浅色主题下使用）
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
        "wv-card wv-swiss w-full max-w-xl cursor-pointer rounded-2xl p-5 shadow-geist-md touch-manipulation sm:p-7",
        isDark ? "bg-gray-100" : "bg-white",
      )}
      style={{ ...accentCssVar(ctx), fontSize: "12pt", lineHeight: 1.65, ...themeStyle }}
      onClick={() => {
        if (!revealed) onReveal();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="break-words text-[1.85em] font-semibold leading-[1.15] tracking-[-0.02em]">{entry.headword}</div>
          {pron.uk || pron.us ? (
            <div className="wv-mono mt-[0.4em] flex flex-wrap gap-x-[1em] text-[0.85em] opacity-75">
              {pron.uk ? <span>英 {pron.uk}</span> : null}
              {pron.us ? <span>美 {pron.us}</span> : null}
            </div>
          ) : null}
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
        </div>
      </div>

      {revealed ? (
        <div className="mt-[1em] border-t pt-[0.9em]" style={{ borderColor: "var(--wv-line,#e6e6e6)" }}>
          <div className="space-y-[0.75em]">
            {sections.map((sec) => (
              <SectionBlock key={sec.id} entry={entry} section={sec} ctx={ctx} />
            ))}
          </div>
          {sections.length === 0 ? (
            <div className="text-[0.85em] opacity-50">这个词条还没有填写任何字段内容。</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-[1.6em] text-center text-[0.78em] opacity-40">
          轻点卡片显示释义 <span className="wv-kbd-hint hidden sm:inline">（空格）</span>
        </div>
      )}
    </div>
  );
}
