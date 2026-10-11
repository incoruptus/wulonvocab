"use client";

import type { Entry, ExportSettings, SectionDef, Wordbook } from "@/lib/types";
import { isValueEmpty, sliceSenseCells, sliceValue, type SenseCell } from "@/lib/sections";
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

/** 导出字体栈：引用 globals.css 的单一真源（无衬线 = Geist + OPPO Sans；衬线 = Georgia + 思源宋） */
export function fontStackFor(family: ExportSettings["fontFamily"]): string {
  return family === "serif" ? "var(--font-serif)" : "var(--font-sans)";
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
  const style = s.cardStyle;
  const word = applyHeadwordCase(entry.headword, s.headwordCase);
  const wordClass =
    style === "flashcard"
      ? "text-[1.28em] leading-[1.2]"
      : style === "swiss"
        ? "text-[1.32em] leading-[1.22] tracking-[-0.01em]"
        : style === "notebook"
          ? "text-[1.55em] leading-[1.12]"
          : "text-[1.42em] leading-[1.15]";
  // 骨架差异（见 docs/research/themes-2026-10.md）：
  // 辞书=纸色细线 55%；瑞士=更淡细线 40%；手账=无线条（以留白代替）；闪卡=短色标下划线
  const ruleStyle: React.CSSProperties | null = (() => {
    switch (style) {
      case "dictionary":
        return { background: "var(--wv-line,#e6e6e6)", height: 1, width: "100%", opacity: 0.55 };
      case "swiss":
        return { background: "var(--wv-line,#e6e6e6)", height: 1, width: "100%", opacity: 0.4 };
      case "notebook":
        return null;
      case "flashcard":
        return { background: "var(--wv-accent,#0068d6)", height: 2, width: "1.6em", opacity: 1, borderRadius: 2 };
    }
  })();
  const plainTags = style === "dictionary" || style === "swiss";
  const hideTags = style === "flashcard";
  return (
    <div className="wv-card" style={accentCssVar(ctx)}>
      <div className="flex flex-wrap items-baseline gap-x-[0.55em] gap-y-[0.15em]">
        {s.showEntryNumber ? (
          <span className="wv-sense-num text-[0.85em]">{index + 1}</span>
        ) : null}
        <span className={cx("font-semibold tracking-[-0.01em]", wordClass)}>{word}</span>
        {continued ? (
          plainTags ? (
            <span className="text-[0.62em] tracking-[0.08em] text-[var(--wv-soft,#4b4b4b)]">（续）</span>
          ) : (
            <span className="wv-chip" style={{ fontSize: "0.62em", height: "1.9em" }}>
              续
            </span>
          )
        ) : null}
        {entry.tags.length && !hideTags ? (
          plainTags ? (
            <span className="ml-auto max-w-[60%] truncate text-[0.7em] text-[var(--wv-soft,#4b4b4b)]">
              {entry.tags.slice(0, 4).join(" · ")}
            </span>
          ) : (
            <span className="ml-auto flex flex-wrap items-center gap-[0.3em]">
              {entry.tags.slice(0, 4).map((t) => (
                <span key={t} className="wv-chip wv-chip--plain" style={{ fontSize: "0.68em" }}>
                  {t}
                </span>
              ))}
            </span>
          )
        ) : null}
        {entry.status === "mastered" && !hideTags ? (
          plainTags ? (
            <span className={cx("text-[0.62em] text-[var(--wv-soft,#4b4b4b)]", !entry.tags.length && "ml-auto")}>已掌握</span>
          ) : (
            <span className="wv-chip wv-chip--plain" style={{ fontSize: "0.62em", marginLeft: "auto", opacity: 0.7 }}>
              已掌握
            </span>
          )
        ) : null}
      </div>
      {ruleStyle ? (
        <div className="mt-[0.32em]" style={ruleStyle} />
      ) : (
        <div className="mt-[0.45em]" />
      )}
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
  cells,
  forceEmpty,
  headerOnly,
}: {
  entry: Entry;
  section: SectionDef;
  ctx: CardCtx;
  slice?: [number, number];
  /** 义项细粒度切片（优先于 slice） */
  cells?: SenseCell[];
  forceEmpty?: boolean;
  /** 测量模式：仅渲染标签，用于计算可拆分块的 header 高度 */
  headerOnly?: boolean;
}) {
  const s = ctx.settings;
  const raw = entry.values[section.key];
  const empty = forceEmpty || isValueEmpty(section.type, raw);
  if (empty && s.hideEmpty && !headerOnly) return null;

  const value =
    cells && section.type === "senses"
      ? sliceSenseCells(raw, cells)
      : slice
        ? sliceValue(section.type, raw, slice[0], slice[1])
        : raw;
  const isContinued = cells
    ? cells.length > 0 && (cells[0].from > 0 || cells[0].part === "extras")
    : Boolean(slice && slice[0] > 0);
  const style = s.cardStyle;
  const labelColor = style === "swiss" || style === "flashcard" ? "var(--wv-soft,#4b4b4b)" : "var(--wv-accent,#0068d6)";
  const label = (() => {
    switch (style) {
      case "notebook":
        return (
          <div className="mb-[0.36em]">
            <span
              className="inline-flex items-center gap-[0.3em] rounded-[0.4em] px-[0.55em] pb-[0.1em] pt-[0.06em] text-[0.68em] font-semibold tracking-[0.04em]"
              style={{
                background: "color-mix(in srgb, var(--wv-accent,#0068d6) 12%, transparent)",
                color: labelColor,
                transform: "rotate(-1.2deg)",
              }}
            >
              {section.label}
              {isContinued ? <span style={{ opacity: 0.6 }}>续</span> : null}
            </span>
          </div>
        );
      case "dictionary":
        return (
          <div
            className="mb-[0.24em] text-[0.68em] font-semibold tracking-[0.06em]"
            style={{ color: labelColor, fontVariantCaps: "small-caps" }}
          >
            {section.label}
            {isContinued ? <span style={{ opacity: 0.55 }}>（续）</span> : null}
          </div>
        );
      case "swiss":
        return (
          <div
            className="mb-[0.3em] text-[0.62em] font-medium uppercase tracking-[0.14em]"
            style={{ color: labelColor, opacity: 0.8 }}
          >
            {section.label}
            {isContinued ? <span style={{ opacity: 0.6 }}> · 续</span> : null}
          </div>
        );
      default:
        return (
          <div
            className="mb-[0.22em] text-[0.62em] font-medium tracking-[0.06em]"
            style={{ color: labelColor, opacity: 0.85 }}
          >
            {section.label}
            {isContinued ? <span style={{ opacity: 0.6 }}>（续）</span> : null}
          </div>
        );
    }
  })();

  return (
    <div className="wv-card" style={accentCssVar(ctx)}>
      {s.showSectionLabels ? label : null}
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
   手账「笔记带」（Notebook 专属 · themes-2026-10 §2.3）
   cue 列 30% + 书写区 3 行实线 + CSS 方框勾选（不用 Unicode ☐）；
   splittable:false 且 glueWithPrev（见 paginate）；2 栏降级单列。
   ============================================================ */

export function NotebookBandBlock({ ctx }: { ctx: CardCtx }) {
  const twoCol = ctx.settings.columns > 1;
  const boxes = Array.from({ length: 3 });
  const lines = Array.from({ length: 3 });
  return (
    <div className="wv-card" style={accentCssVar(ctx)}>
      <div className={cx("wv-band", twoCol && "wv-band--single")}>
        <div className={cx("wv-band__cue", twoCol && "wv-band__cue--row")}>
          <span className="wv-band__cue-label">自测</span>
          <span className={cx("flex gap-[0.5em]", twoCol ? "flex-row" : "flex-col items-start gap-[1.5em]")}>
            {boxes.map((_, i) => (
              <span key={i} className="wv-band__box" />
            ))}
          </span>
        </div>
        <div className="wv-band__write">
          {lines.map((_, i) => (
            <div key={i} className="wv-band__line" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   网格（闪卡）单元
   ============================================================ */

/** 剪裁辅助线：四角外侧 2.6mm 直角短线（落在卡片间缝里；不参与布局测量） */
function CropMarks() {
  const mark = "absolute bg-[var(--wv-soft,#4b4b4b)] opacity-60";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className={cx(mark, "left-[-3mm] top-[-1.6mm] h-[1px] w-[2.6mm]")} />
      <span className={cx(mark, "left-[-1.6mm] top-[-3mm] h-[2.6mm] w-[1px]")} />
      <span className={cx(mark, "right-[-3mm] top-[-1.6mm] h-[1px] w-[2.6mm]")} />
      <span className={cx(mark, "right-[-1.6mm] top-[-3mm] h-[2.6mm] w-[1px]")} />
      <span className={cx(mark, "bottom-[-1.6mm] left-[-3mm] h-[1px] w-[2.6mm]")} />
      <span className={cx(mark, "bottom-[-3mm] left-[-1.6mm] h-[2.6mm] w-[1px]")} />
      <span className={cx(mark, "bottom-[-1.6mm] right-[-3mm] h-[1px] w-[2.6mm]")} />
      <span className={cx(mark, "bottom-[-3mm] right-[-1.6mm] h-[2.6mm] w-[1px]")} />
    </div>
  );
}

export function FlashcardCell({
  entry,
  ctx,
  index,
  cropMarks,
}: {
  entry: Entry;
  ctx: CardCtx;
  index: number;
  cropMarks?: boolean;
}) {
  const s = ctx.settings;
  const isFlash = s.cardStyle === "flashcard";
  const sections = ctx.schema.sections
    .filter((sec) => (s.sectionVisibility[sec.id] ?? sec.visible) && sec.type !== "divider")
    .slice(0, s.grid.flashcard ? 2 : 99);
  return (
    <div className="relative h-full">
      {cropMarks ? <CropMarks /> : null}
      <div
        className={cx(
          "wv-card flex h-full min-h-0 flex-col overflow-hidden p-[0.7em]",
          s.grid.showBorder ? (isFlash ? "rounded-[0.9em]" : "rounded-[0.4em]") : "",
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
    </div>
  );
}
