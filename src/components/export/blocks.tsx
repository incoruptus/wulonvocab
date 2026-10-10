"use client";

import type { Entry, ExportSettings, SectionDef, Wordbook } from "@/lib/types";
import { isValueEmpty, sliceValue } from "@/lib/sections";
import { ValueView } from "@/components/value/ValueView";
import { cx } from "@/lib/utils";

/** 导出渲染上下文：整个文档共享的设置与 Schema */
export interface CardCtx {
  settings: ExportSettings;
  schema: Wordbook["schema"];
}

export function applyHeadwordCase(word: string, mode: ExportSettings["headwordCase"]): string {
  switch (mode) {
    case "lower":
      return word.toLowerCase();
    case "upper":
      return word.toUpperCase();
    case "title":
      return word.replace(/\b\w/g, (m) => m.toUpperCase());
    default:
      return word;
  }
}

export function accentCssVar(ctx: CardCtx): React.CSSProperties {
  const hex = accentHex(ctx.settings.accent);
  return {
    ["--wv-accent" as string]: hex,
  };
}

function accentHex(id: ExportSettings["accent"]): string {
  // 局部引入避免循环依赖
  const map: Record<string, string> = {
    blue: "#0068d6",
    violet: "#7c3aed",
    teal: "#0d9488",
    amber: "#b45309",
    rose: "#be185d",
    green: "#15803d",
    gray: "#52525b",
  };
  return map[id] ?? map.blue;
}

/* ============================================================
   词条头部
   ============================================================ */

export function EntryHeaderBlock({
  entry,
  ctx,
  index,
  continued,
}: {
  entry: Entry;
  ctx: CardCtx;
  index: number;
  continued?: boolean;
}) {
  const s = ctx.settings;
  const compact = s.cardStyle === "compact";
  const minimal = s.cardStyle === "minimal";
  const word = applyHeadwordCase(entry.headword, s.headwordCase);
  const ruleStyle: React.CSSProperties = {
    background: minimal || s.cardStyle === "notebook" ? "var(--wv-accent)" : "var(--wv-accent)",
    opacity: minimal ? 0.35 : s.cardStyle === "notebook" ? 0.3 : 0.9,
    width: s.cardStyle === "classic" ? "100%" : compact ? "2em" : "2.6em",
    height: s.cardStyle === "classic" ? 2 : 1.5,
  };
  if (s.cardStyle === "notebook") {
    ruleStyle.background = "repeating-linear-gradient(90deg, var(--wv-line,#c9c9c9) 0 6px, transparent 6px 10px)";
    ruleStyle.opacity = 1;
    delete ruleStyle.width;
  }
  return (
    <div className="wv-card" style={accentCssVar(ctx)}>
      <div className="flex flex-wrap items-baseline gap-x-[0.55em] gap-y-[0.15em]">
        {s.showEntryNumber ? (
          <span className="wv-sense-num text-[0.85em]">{index + 1}</span>
        ) : null}
        <span
          className={cx(
            "font-semibold tracking-[-0.01em]",
            compact ? "text-[1.32em] leading-[1.2]" : "text-[1.5em] leading-[1.15]",
          )}
        >
          {word}
        </span>
        {continued ? (
          <span className="wv-chip" style={{ fontSize: "0.62em", height: "1.9em" }}>
            续
          </span>
        ) : null}
        {entry.tags.length && !compact ? (
          <span className="ml-auto flex flex-wrap items-center gap-[0.3em]">
            {entry.tags.slice(0, 4).map((t) => (
              <span key={t} className="wv-chip wv-chip--plain" style={{ fontSize: "0.68em" }}>
                {t}
              </span>
            ))}
          </span>
        ) : null}
        {entry.status === "mastered" ? (
          <span
            className="wv-chip wv-chip--plain"
            style={{ fontSize: "0.62em", marginLeft: "auto", opacity: 0.7 }}
          >
            已掌握
          </span>
        ) : null}
      </div>
      <div className={cx(s.cardStyle === "notebook" ? "mt-[0.42em]" : "mt-[0.32em]")} style={ruleStyle} />
    </div>
  );
}

/* ============================================================
   字段块
   ============================================================ */

export function SectionBlock({
  entry,
  section,
  ctx,
  slice,
  forceEmpty,
  headerOnly,
}: {
  entry: Entry;
  section: SectionDef;
  ctx: CardCtx;
  slice?: [number, number];
  forceEmpty?: boolean;
  /** 测量模式：仅渲染标签，用于计算可拆分块的 header 高度 */
  headerOnly?: boolean;
}) {
  const s = ctx.settings;
  const raw = entry.values[section.key];
  const empty = forceEmpty || isValueEmpty(section.type, raw);
  if (empty && s.hideEmpty && !headerOnly) return null;

  const value = slice ? sliceValue(section.type, raw, slice[0], slice[1]) : raw;
  const compact = s.cardStyle === "compact";
  const labelColor = s.cardStyle === "minimal" ? "var(--wv-soft,#4b4b4b)" : "var(--wv-accent,#0068d6)";

  return (
    <div className="wv-card" style={accentCssVar(ctx)}>
      {s.showSectionLabels && !compact ? (
        <div
          className="mb-[0.28em] flex items-center gap-[0.35em] text-[0.7em] font-semibold tracking-[0.06em]"
          style={{ color: labelColor }}
        >
          <span>{section.label}</span>
          {slice && slice[0] > 0 ? <span style={{ opacity: 0.55 }}>（续）</span> : null}
        </div>
      ) : compact ? (
        <div className="mb-[0.16em] text-[0.64em] font-semibold tracking-[0.08em]" style={{ color: labelColor, opacity: 0.85 }}>
          {section.label}
        </div>
      ) : null}
      {headerOnly ? null : empty ? (
        s.writingLines > 0 ? (
          <div className="space-y-[0.35em] pt-[0.2em]">
            {Array.from({ length: s.writingLines }).map((_, i) => (
              <div key={i} className="wv-writing-line" />
            ))}
          </div>
        ) : (
          <div className="h-[1.3em] wv-writing-line" />
        )
      ) : (
        <ValueView section={section} value={value} print />
      )}
    </div>
  );
}

/* ============================================================
   网格（闪卡）单元
   ============================================================ */

export function FlashcardCell({ entry, ctx, index }: { entry: Entry; ctx: CardCtx; index: number }) {
  const s = ctx.settings;
  const sections = ctx.schema.sections
    .filter((sec) => (s.sectionVisibility[sec.id] ?? sec.visible) && sec.type !== "divider")
    .slice(0, s.grid.flashcard ? 2 : 99);
  return (
    <div
      className={cx(
        "wv-card flex h-full min-h-0 flex-col overflow-hidden p-[0.7em]",
        s.grid.showBorder ? "rounded-[0.4em]" : "",
      )}
      style={{
        ...accentCssVar(ctx),
        border: s.grid.showBorder ? "1px solid var(--wv-line,#e3e3e3)" : undefined,
      }}
    >
      <EntryHeaderBlock entry={entry} ctx={ctx} index={index} />
      <div className={cx("min-h-0 flex-1 overflow-hidden", s.grid.flashcard ? "mt-[0.4em]" : "mt-[0.5em] space-y-[0.5em]")}>
        {sections.map((sec) => (
          <SectionBlock key={sec.id} entry={entry} section={sec} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
