"use client";

import type {
  ExampleItem,
  ImageValue,
  KeyValueItem,
  PronunciationValue,
  RatingValue,
  SectionDef,
  SenseItem,
  TableValue,
  TransformItem,
} from "@/lib/types";
import { mmToPx } from "@/lib/paper";
import { MarkdownLite } from "@/components/MarkdownLite";
import { Star } from "lucide-react";

/**
 * 字段值渲染器：屏幕预览 / 导出卡片 / 打印共用。
 * 全部使用 em 相对单位，由外层 .wv-card 的 font-size 控制缩放。
 */

interface ValueViewProps {
  section: SectionDef;
  value: unknown;
  /** 打印模式：去掉交互元素（如音频播放） */
  print?: boolean;
}

export function ValueView({ section, value, print }: ValueViewProps) {
  switch (section.type) {
    case "text":
      return <TextView section={section} value={value} />;
    case "markdown":
      return <MarkdownLite className="text-[0.95em]" text={String(value ?? "")} />;
    case "quote":
      return <QuoteView section={section} value={value} />;
    case "list":
      return <ListView section={section} value={value} />;
    case "tags":
      return <TagsView value={value} />;
    case "pronunciation":
      return <PronunciationView section={section} value={value} print={print} />;
    case "senses":
      return <SensesView section={section} value={value} />;
    case "examples":
      return <ExamplesView section={section} value={value} />;
    case "keyvalue":
      return <KeyValueView section={section} value={value} />;
    case "transforms":
      return <TransformsView section={section} value={value} />;
    case "table":
      return <TableView section={section} value={value} />;
    case "image":
      return <ImageView section={section} value={value} />;
    case "rating":
      return <RatingView section={section} value={value} />;
    case "divider":
      return <DividerView section={section} />;
    default:
      return null;
  }
}

/* ---------------- 基础类型 ---------------- */

function TextView({ section, value }: { section: SectionDef; value: unknown }) {
  const text = String(value ?? "");
  if (!text) return null;
  return (
    <div className="text-[0.92em] leading-[1.55]">
      {section.options.prefix ? (
        <span className="mr-[0.3em] font-semibold text-[var(--wv-accent,#0068d6)]">
          {section.options.prefix}
        </span>
      ) : null}
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

function QuoteView({ section, value }: { section: SectionDef; value: unknown }) {
  const text = String(value ?? "");
  if (!text) return null;
  const tone = section.options.tone ?? "tip";
  const color = tone === "warning" ? "#b45309" : tone === "info" ? "#0068d6" : "#15803d";
  return (
    <div
      className="rounded-[0.4em] px-[0.7em] py-[0.5em] text-[0.88em] leading-[1.55]"
      style={{ borderLeft: `0.22em solid ${color}`, background: `${color}14` }}
    >
      <MarkdownLite text={text} />
    </div>
  );
}

function ListView({ section, value }: { section: SectionDef; value: unknown }) {
  const items = (value as string[]) ?? [];
  if (!items.length) return null;
  if (section.options.ordered) {
    return (
      <ol className="space-y-[0.28em] text-[0.92em]">
        {items.map((item, i) => (
          <li key={i} className="flex gap-[0.45em]">
            <span className="wv-sense-num">{i + 1}.</span>
            <span className="min-w-0 flex-1">
              <MarkdownLite text={item} />
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="space-y-[0.3em] text-[0.92em]">
      {items.map((item, i) => (
        <li key={i} className="flex gap-[0.45em]">
          <span className="mt-[0.42em] inline-block size-[0.34em] shrink-0 rounded-full bg-[var(--wv-accent,#0068d6)]" />
          <span className="min-w-0 flex-1">
            <MarkdownLite text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function TagsView({ value }: { value: unknown }) {
  const items = (value as string[]) ?? [];
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-[0.35em]">
      {items.map((t, i) => (
        <span key={i} className="wv-chip wv-chip--fill">
          {t}
        </span>
      ))}
    </div>
  );
}

function PronunciationView({
  section,
  value,
  print,
}: {
  section: SectionDef;
  value: unknown;
  print?: boolean;
}) {
  const p = (value as PronunciationValue) ?? {};
  const o = section.options;
  const showUk = o.showUk !== false && p.uk;
  const showUs = o.showUs !== false && p.us;
  if (!showUk && !showUs && !(o.showAudio && (p.audioUk || p.audioUs))) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-[0.9em] gap-y-[0.25em] text-[0.92em]">
      {showUk ? (
        <span className="inline-flex items-baseline gap-[0.35em]">
          <span className="text-[0.78em] font-semibold text-[var(--wv-accent,#0068d6)]">英</span>
          <span className="wv-mono text-[0.95em]">{p.uk}</span>
        </span>
      ) : null}
      {showUs ? (
        <span className="inline-flex items-baseline gap-[0.35em]">
          <span className="text-[0.78em] font-semibold text-[var(--wv-accent,#0068d6)]">美</span>
          <span className="wv-mono text-[0.95em]">{p.us}</span>
        </span>
      ) : null}
      {o.showAudio && !print ? (
        <span className="inline-flex items-center gap-[0.35em] text-[0.78em] text-[var(--wv-soft,#4b4b4b)]">
          {p.audioUk ? (
            <a href={p.audioUk} target="_blank" rel="noreferrer" className="underline decoration-dotted">
              英音
            </a>
          ) : null}
          {p.audioUs ? (
            <a href={p.audioUs} target="_blank" rel="noreferrer" className="underline decoration-dotted">
              美音
            </a>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------- 核心：词性与释义 ---------------- */

export function SensesView({ section, value }: { section: SectionDef; value: unknown }) {
  const senses = (value as SenseItem[]) ?? [];
  const o = section.options;
  if (!senses.length) return null;

  const groups: { pos: string; items: { sense: SenseItem; n: number | null }[] }[] = [];
  if (o.groupByPos !== false) {
    const map = new Map<string, { sense: SenseItem; n: number | null }[]>();
    const order: string[] = [];
    for (const sense of senses) {
      const pos = sense.pos || "";
      if (!map.has(pos)) {
        map.set(pos, []);
        order.push(pos);
      }
      map.get(pos)!.push({ sense, n: null });
    }
    for (const pos of order) {
      const items = map.get(pos)!;
      let counter = 0;
      for (const it of items) {
        if (it.sense.cont) continue; // 续块（例句扩展）不占编号
        counter += 1;
        it.n = counter;
      }
      groups.push({ pos, items });
    }
  } else {
    let counter = 0;
    groups.push({
      pos: "",
      items: senses.map((sense) => {
        if (sense.cont) return { sense, n: null as number | null };
        counter += 1;
        return { sense, n: counter as number | null };
      }),
    });
  }

  return (
    <div className="space-y-[0.7em]">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-[0.45em]">
          {group.pos ? <PosBadge pos={group.pos} style={o.posStyle} /> : null}
          <div className="space-y-[0.55em]">
            {group.items.map(({ sense, n }, idx) => (
              <SenseItemView key={`${sense.id ?? "s"}-${idx}`} sense={sense} n={n} section={section} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PosBadge({ pos, style }: { pos: string; style?: "badge" | "plain" | "inline" }) {
  if (style === "plain") {
    return <div className="text-[0.9em] font-semibold text-[var(--wv-accent,#0068d6)]">{pos}</div>;
  }
  if (style === "inline") return null;
  return (
    <div>
      <span
        className="inline-flex h-[1.5em] items-center rounded-[0.32em] px-[0.5em] text-[0.8em] font-semibold"
        style={{
          background: "color-mix(in srgb, var(--wv-accent, #0068d6) 11%, transparent)",
          color: "color-mix(in srgb, var(--wv-accent, #0068d6) 82%, #1b1b1b)",
        }}
      >
        {pos}
      </span>
    </div>
  );
}

function SenseItemView({ sense, n, section }: { sense: SenseItem; n: number | null; section: SectionDef }) {
  const o = section.options;
  const inlinePos = o.posStyle === "inline" && sense.pos;
  return (
    <div className="flex gap-[0.5em]">
      {n != null ? (
        <span className="wv-sense-num pt-[0.12em]">{n}.</span>
      ) : (
        <span className="wv-sense-num w-[0.9em] shrink-0 pt-[0.12em] opacity-0" aria-hidden>
          ·
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-[0.3em]">
        {o.showTranslation !== false && sense.translation ? (
          <div className="text-[0.98em] font-medium">
            {inlinePos ? (
              <span className="mr-[0.3em] font-semibold text-[var(--wv-accent,#0068d6)]">{sense.pos}</span>
            ) : null}
            <MarkdownLite text={sense.translation} />
          </div>
        ) : null}
        {o.showDefinition !== false && sense.definition ? (
          <div className="text-[0.86em] italic leading-[1.5] text-[var(--wv-soft,#4b4b4b)]">
            <MarkdownLite text={sense.definition} />
          </div>
        ) : null}
        {o.showUsage !== false && sense.usage ? (
          <div className="text-[0.86em] text-[var(--wv-soft,#4b4b4b)]">
            <span className="font-semibold text-[var(--wv-accent,#0068d6)]">用法</span>
            <span className="mx-[0.35em]">·</span>
            <MarkdownLite className="inline" text={sense.usage} />
          </div>
        ) : null}
        {o.showPatterns !== false && sense.patterns.length ? (
          <div className="flex flex-wrap gap-[0.35em]">
            {sense.patterns.map((p, i) => (
              <span key={i} className="wv-chip wv-chip--plain wv-mono">
                {p}
              </span>
            ))}
          </div>
        ) : null}
        {o.showExamples !== false && sense.examples.length ? (
          <ExamplesList items={sense.examples} numbering />
        ) : null}
        {o.showCollocations !== false && sense.collocations.length ? (
          <div className="text-[0.86em] text-[var(--wv-soft,#4b4b4b)]">
            <span className="font-semibold text-[var(--wv-accent,#0068d6)]">搭配</span>
            <span className="mx-[0.35em]">·</span>
            {sense.collocations.join("；")}
          </div>
        ) : null}
        {o.showSynonyms !== false && sense.synonyms.length ? (
          <SynAntRow label="近义词" items={sense.synonyms} />
        ) : null}
        {o.showAntonyms && sense.antonyms.length ? <SynAntRow label="反义词" items={sense.antonyms} /> : null}
        {o.showNotes !== false && sense.notes ? (
          <div className="wv-quote text-[0.86em] text-[var(--wv-soft,#4b4b4b)]">
            <MarkdownLite text={sense.notes} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SynAntRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="text-[0.86em] text-[var(--wv-soft,#4b4b4b)]">
      <span className="font-semibold text-[var(--wv-accent,#0068d6)]">{label}</span>
      <span className="mx-[0.35em]">·</span>
      <span>{items.join("、")}</span>
    </div>
  );
}

/* ---------------- 例句 ---------------- */

function ExamplesList({ items, numbering }: { items: ExampleItem[]; numbering?: boolean }) {
  return (
    <div className="space-y-[0.3em]">
      {items.map((ex, i) => (
        <div key={i} className="flex gap-[0.45em]">
          {numbering ? (
            <span className="wv-sense-num shrink-0 pt-[0.1em] text-[0.78em] opacity-70">{i + 1}</span>
          ) : (
            <span className="mt-[0.55em] inline-block h-px w-[0.7em] shrink-0 bg-[var(--wv-accent,#0068d6)] opacity-60" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[0.9em] leading-[1.5]">{ex.en}</div>
            {ex.zh ? <div className="text-[0.84em] leading-[1.5] text-[var(--wv-soft,#4b4b4b)]">{ex.zh}</div> : null}
            {ex.source ? (
              <div className="mt-[0.05em] text-[0.75em] text-[var(--wv-soft,#4b4b4b)] opacity-80">— {ex.source}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExamplesView({ section, value }: { section: SectionDef; value: unknown }) {
  const items = (value as ExampleItem[]) ?? [];
  if (!items.length) return null;
  return (
    <ExamplesList
      items={section.options.showZh === false ? items.map((e) => ({ ...e, zh: undefined })) : items}
      numbering={section.options.numbering}
    />
  );
}

/* ---------------- 词族 / 键值对 ---------------- */

function KeyValueView({ section, value }: { section: SectionDef; value: unknown }) {
  const items = (value as KeyValueItem[]) ?? [];
  if (!items.length) return null;
  if (section.options.inline) {
    return (
      <div className="flex flex-wrap gap-x-[0.8em] gap-y-[0.3em] text-[0.9em]">
        {items.map((it, i) => (
          <span key={i}>
            <span className="font-semibold">{it.key}</span>
            {it.value ? <span className="text-[var(--wv-soft,#4b4b4b)]"> {it.value}</span> : null}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-[0.28em] text-[0.9em]">
      {items.map((it, i) => (
        <div key={i} className="flex gap-[0.55em]">
          <span className="min-w-[4.5em] shrink-0 font-semibold">{it.key}</span>
          <span className="min-w-0 flex-1 text-[var(--wv-soft,#4b4b4b)]">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 词性变换 ---------------- */

function TransformsView({ section, value }: { section: SectionDef; value: unknown }) {
  const items = (value as TransformItem[]) ?? [];
  const o = section.options;
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-x-[1em] gap-y-[0.35em] text-[0.9em]">
      {items.map((t, i) => (
        <span key={i} className="inline-flex items-baseline gap-[0.35em]">
          <span className="font-medium">{t.form}</span>
          {o.showPos !== false && t.pos ? (
            <span className="text-[0.82em] text-[var(--wv-accent,#0068d6)]">{t.pos}</span>
          ) : null}
          {o.showNote !== false && t.note ? (
            <span className="text-[0.8em] text-[var(--wv-soft,#4b4b4b)]">（{t.note}）</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/* ---------------- 表格 ---------------- */

function TableView({ section, value }: { section: SectionDef; value: unknown }) {
  const t = value as TableValue;
  if (!t || !t.columns?.length) return null;
  const showHead = section.options.headerRow !== false;
  const zebra = section.options.zebra !== false;
  const bodyRows = showHead ? t.rows : [t.columns, ...t.rows];
  const header = showHead ? t.columns : null;
  return (
    <table className="wv-table">
      {header ? (
        <thead>
          <tr>
            {header.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri} style={zebra && ri % 2 === 1 ? { background: "rgba(0,0,0,0.028)" } : undefined}>
            {row.map((cell, ci) => (
              <td key={ci}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- 图片 ---------------- */

function ImageView({ section, value }: { section: SectionDef; value: unknown }) {
  const images = (value as ImageValue[]) ?? [];
  if (!images.length) return null;
  const h = section.options.imageHeight ?? 40;
  return (
    <div className="flex flex-wrap gap-[0.6em]">
      {images.map((img, i) => (
        <figure key={i} className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt={img.caption ?? ""}
            style={{ height: mmToPx(h) }}
            className="max-w-full rounded-[0.3em] object-contain"
          />
          {section.options.showCaption !== false && img.caption ? (
            <figcaption className="mt-[0.25em] text-center text-[0.78em] text-[var(--wv-soft,#4b4b4b)]">
              {img.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

/* ---------------- 评分 ---------------- */

function RatingView({ section, value }: { section: SectionDef; value: unknown }) {
  const r = value as RatingValue;
  if (!r || !r.value) return null;
  const max = section.options.max ?? r.max ?? 5;
  const style = section.options.style ?? "stars";
  return (
    <div className="flex items-center gap-[0.4em] text-[0.9em]">
      {section.options.label || r.label ? (
        <span className="text-[0.85em] text-[var(--wv-soft,#4b4b4b)]">{section.options.label ?? r.label}：</span>
      ) : null}
      <span className="inline-flex items-center gap-[0.12em]">
        {Array.from({ length: max }).map((_, i) =>
          style === "dots" ? (
            <span
              key={i}
              className="inline-block size-[0.55em] rounded-full"
              style={{ background: i < r.value ? "var(--wv-accent, #0068d6)" : "color-mix(in srgb, currentColor 20%, transparent)" }}
            />
          ) : (
            <StarIcon key={i} filled={i < r.value} />
          ),
        )}
      </span>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star
      className="size-[0.85em]"
      style={{ color: filled ? "var(--wv-accent, #0068d6)" : "color-mix(in srgb, currentColor 22%, transparent)" }}
      fill={filled ? "currentColor" : "none"}
      strokeWidth={1.5}
    />
  );
}

/* ---------------- 分隔线 ---------------- */

function DividerView({ section }: { section: SectionDef }) {
  const style = section.options.dividerStyle ?? "solid";
  return <hr className="my-[0.3em] w-full" style={{ borderTop: `1px ${style} var(--wv-line, #e6e6e6)` }} />;
}
