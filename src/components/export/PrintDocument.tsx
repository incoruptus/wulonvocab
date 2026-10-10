"use client";

import { useMemo } from "react";
import type { Entry, Wordbook } from "@/lib/types";
import { TONES } from "@/lib/paper";
import { FlashcardCell, SectionBlock, EntryHeaderBlock } from "@/components/export/blocks";
import type { ExportDocument } from "@/components/export/useExportDocument";
import type { PlannedPage } from "@/lib/export/paginate";
import { cx } from "@/lib/utils";

type ContentPage = { kind: "flow"; planned: PlannedPage } | { kind: "grid"; items: Entry[] };

export interface PrintDocumentProps {
  book: Wordbook;
  doc: ExportDocument;
}

/** 完整导出文档：封面 → 索引 → 内容页（流式分栏或网格闪卡） */
export function PrintDocument({ book, doc }: PrintDocumentProps) {
  const { ctx, entries, geometry, plan, specs, mode, gridPerPage } = doc;
  const s = ctx.settings;
  const tone = TONES[s.tone];

  const specMap = useMemo(() => new Map(specs.map((sp) => [sp.id, sp])), [specs]);

  const contentPages: ContentPage[] =
    mode === "grid"
      ? chunk(entries, gridPerPage).map((items) => ({ kind: "grid" as const, items }))
      : (plan?.pages ?? []).map((planned) => ({ kind: "flow" as const, planned }));

  const indexPages = useMemo(() => {
    if (!s.index.enabled || mode === "grid") return [] as typeof entries[];
    return chunk(entries, indexCapacity(geometry.contentH, geometry.contentW, s.index.columns, s.fontScale));
  }, [s.index.enabled, s.index.columns, s.fontScale, entries, geometry.contentH, geometry.contentW, mode]);

  const coverPages = s.cover.enabled ? 1 : 0;
  const totalPages = coverPages + indexPages.length + contentPages.length;

  const pageNo = (globalIndex: number) => globalIndex + 1 - coverPages;

  return (
    <div className="wv-doc" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
      {s.cover.enabled ? (
        <PageShell geometry={geometry} tone={tone} mirrored={false} pageNo={0} totalPages={totalPages} showFooter={false}>
          <CoverPage book={book} doc={doc} />
        </PageShell>
      ) : null}

      {indexPages.map((pageEntries, i) => {
        const globalIndex = coverPages + i;
        return (
          <PageShell
            key={`idx-${i}`}
            geometry={geometry}
            tone={tone}
            mirrored={false}
            pageNo={pageNo(globalIndex)}
            totalPages={totalPages - coverPages}
            footerText={s.footer.text || undefined}
            bookName={s.footer.bookName ? book.name : undefined}
          >
            <IndexPage
              title={s.index.title}
              entries={pageEntries}
              columns={s.index.columns}
              showPageNumbers={s.index.showPageNumbers}
              pageOf={(eid) => {
                const pi = plan?.entryFirstPage[eid];
                if (pi === undefined) return "—";
                return String(pageNo(coverPages + indexPages.length + pi));
              }}
            />
          </PageShell>
        );
      })}

      {contentPages.map((page, i) => {
        const globalIndex = coverPages + indexPages.length + i;
        return (
          <PageShell
            key={`pg-${i}`}
            geometry={geometry}
            tone={tone}
            mirrored={s.margin.mirror}
            pageNo={pageNo(globalIndex)}
            totalPages={totalPages - coverPages}
            footerText={s.footer.text || undefined}
            bookName={s.footer.bookName ? book.name : undefined}
            enabledFooter={s.footer.pageNumbers}
          >
            {page.kind === "flow" ? (
              <div className="flex h-full w-full" style={{ gap: geometry.columnGapPx }}>
                {page.planned.slots.map((slotBlocks, slotIndex) => (
                  <div
                    key={slotIndex}
                    className="wv-flow-column"
                    style={{ width: geometry.slotW, height: "100%" }}
                  >
                    {slotBlocks.map((pb, bi) => {
                      const spec = specMap.get(pb.id);
                      if (!spec) return null;
                      const marginTop = bi === 0 ? 0 : spec.gapBefore;
                      return (
                        <div key={`${pb.id}-${bi}`} className="wv-block" style={{ marginTop }}>
                          {spec.kind === "header" ? (
                            <EntryHeaderBlock
                              entry={spec.entry}
                              ctx={ctx}
                              index={spec.entryIndex}
                              continued={pb.continued && s.continuationMark}
                            />
                          ) : (
                            <SectionBlock entry={spec.entry} section={spec.section!} ctx={ctx} slice={pb.slice} cells={pb.cells} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid h-full w-full"
                style={{
                  gridTemplateColumns: `repeat(${s.grid.columns}, 1fr)`,
                  gridTemplateRows: `repeat(${s.grid.rows}, minmax(0, 1fr))`,
                  gap: "8px",
                }}
              >
                {page.items.map((entry, ei) => (
                  <FlashcardCell key={entry.id} entry={entry} ctx={ctx} index={i * gridPerPage + ei} />
                ))}
                {Array.from({ length: gridPerPage - page.items.length }).map((_, bi) => (
                  <div key={`blank-${bi}`} />
                ))}
              </div>
            )}
          </PageShell>
        );
      })}
    </div>
  );
}

/* ---------------- 页面外壳（尺寸 mm 精确、镜像装订边距、页脚） ---------------- */

function PageShell({
  geometry,
  tone,
  mirrored,
  pageNo,
  totalPages,
  footerText,
  bookName,
  enabledFooter = true,
  showFooter = true,
  children,
}: {
  geometry: ExportDocument["geometry"];
  tone: { bg: string; fg: string };
  mirrored: boolean;
  pageNo: number;
  totalPages: number;
  footerText?: string;
  bookName?: string;
  enabledFooter?: boolean;
  showFooter?: boolean;
  children: React.ReactNode;
}) {
  const m = geometry.marginPx;
  const recto = pageNo % 2 === 1;
  const gutter = m.gutter;
  let left = m.left;
  let right = m.right;
  if (mirrored) {
    const l = recto ? m.left : m.right;
    const r = recto ? m.right : m.left;
    left = l;
    right = r;
    if (recto) left += gutter;
    else right += gutter;
  } else {
    left += gutter;
  }
  const showFooterRow = showFooter && pageNo > 0;
  return (
    <div
      className="wv-page"
      data-wv-page
      style={{
        width: `${geometry.paperMm.width}mm`,
        height: `${geometry.paperMm.height}mm`,
        background: tone.bg,
        color: tone.fg,
        paddingTop: m.top,
        paddingRight: right,
        paddingBottom: m.bottom,
        paddingLeft: left,
        fontSize: geometry.pageFontCss,
        fontFamily: undefined,
        position: "relative",
        ["--wv-fg" as string]: tone.fg,
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>{children}</div>
      {showFooterRow ? (
        <div
          className="absolute flex items-end justify-between text-[0.68em]"
          style={{ left, right, bottom: Math.max(6, m.bottom - 12) }}
        >
          <span className="truncate opacity-70">{footerText ?? ""}</span>
          <span className="tabular-nums opacity-75">
            {enabledFooter ? `${pageNo} / ${totalPages}` : ""}
          </span>
          <span className="truncate text-right opacity-70">{bookName ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 封面 ---------------- */

function CoverPage({ book, doc }: { book: Wordbook; doc: ExportDocument }) {
  const s = doc.ctx.settings;
  const cover = s.cover;
  const title = cover.title || book.name;
  const emoji = book.meta?.coverEmoji;
  const base = "flex h-full w-full flex-col";
  const meta = (
    <div className="mt-auto flex items-end justify-between text-[0.72em] opacity-75">
      <span>{cover.author}</span>
      <span>{cover.dateText}</span>
    </div>
  );
  if (cover.style === "band") {
    return (
      <div className={cx(base, "relative")}>
        <div
          className="absolute left-[-6%] right-[-6%] top-[18%] h-[26%] flex items-center px-[6%]"
          style={{ background: "var(--wv-accent)" }}
        >
          <div className="wv-page-cover-title text-white" style={{ fontSize: "2.1em" }}>
            {title}
          </div>
        </div>
        <div className="mt-[52%] space-y-[0.8em]">
          {emoji ? <div className="text-[2.4em]">{emoji}</div> : null}
          <div className="text-[1.05em] opacity-80">{cover.subtitle}</div>
          {book.description ? <div className="text-[0.85em] opacity-60">{book.description}</div> : null}
        </div>
        {meta}
      </div>
    );
  }
  if (cover.style === "boxed") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          className="flex h-[86%] w-[86%] flex-col items-center justify-center gap-[0.9em] border px-[8%] text-center"
          style={{ borderColor: "color-mix(in srgb, var(--wv-accent) 45%, transparent)", borderWidth: 3 }}
        >
          {emoji ? <div className="text-[2.6em]">{emoji}</div> : null}
          <div className="wv-page-cover-title text-center">{title}</div>
          <div className="h-[2px] w-[4em]" style={{ background: "var(--wv-accent)" }} />
          <div className="text-[1.05em] opacity-80">{cover.subtitle}</div>
          <div className="mt-[2em] text-[0.78em] opacity-70">
            {[cover.author, cover.dateText].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    );
  }
  if (cover.style === "typewriter") {
    return (
      <div className={cx(base, "wv-mono")}>
        <div className="text-[0.85em] opacity-70">{cover.subtitle}</div>
        <div className="mt-[1em] text-[2em] leading-tight font-semibold">{title}</div>
        <div className="mt-[0.6em] h-px w-full opacity-40" style={{ background: "currentColor" }} />
        {book.description ? <div className="mt-[0.8em] text-[0.85em] opacity-70">{book.description}</div> : null}
        {meta}
      </div>
    );
  }
  // minimal（默认）
  return (
    <div className={cx(base, "items-center text-center")}>
      <div className="mt-[18%] space-y-[1.1em]">
        {emoji ? <div className="text-[2.6em]">{emoji}</div> : null}
        <div className="wv-page-cover-title">{title}</div>
        <div className="mx-auto h-[2px] w-[3.2em]" style={{ background: "var(--wv-accent)" }} />
        <div className="text-[1.05em] opacity-80">{cover.subtitle}</div>
        {book.description ? (
          <div className="mx-auto max-w-[24em] text-[0.82em] leading-relaxed opacity-60">{book.description}</div>
        ) : null}
      </div>
      <div className="mt-auto flex w-full items-end justify-between text-[0.72em] opacity-75">
        <span>{cover.author}</span>
        <span>{cover.dateText}</span>
      </div>
    </div>
  );
}

/* ---------------- 索引 ---------------- */

function IndexPage({
  title,
  entries,
  columns,
  showPageNumbers,
  pageOf,
}: {
  title: string;
  entries: Wordbook["entries"];
  columns: number;
  showPageNumbers: boolean;
  pageOf: (id: string) => string;
}) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-[0.9em] text-[1.15em] font-semibold">{title}</div>
      <div
        className="wv-index-col grid flex-1 content-start"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {columns > 1
          ? splitColumns(entries, columns).map((col, ci) => (
              <div key={ci} className="space-y-[0.42em]">
                {col.map((entry) => (
                  <IndexRow key={entry.id} word={entry.headword} no={showPageNumbers ? pageOf(entry.id) : ""} />
                ))}
              </div>
            ))
          : (
            <div className="space-y-[0.42em]">
              {entries.map((entry) => (
                <IndexRow key={entry.id} word={entry.headword} no={showPageNumbers ? pageOf(entry.id) : ""} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function IndexRow({ word, no }: { word: string; no: string }) {
  return (
    <div className="flex items-baseline gap-[0.4em] text-[0.82em]">
      <span className="shrink-0 font-medium">{word}</span>
      <span className="min-w-[1em] flex-1 border-b border-dotted opacity-40" style={{ borderColor: "currentColor" }} />
      <span className="shrink-0 tabular-nums opacity-80">{no}</span>
    </div>
  );
}

/* ---------------- 工具 ---------------- */

function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

function splitColumns<T>(items: T[], columns: number): T[][] {
  const per = Math.ceil(items.length / columns);
  const out: T[][] = [];
  for (let i = 0; i < columns; i += 1) out.push(items.slice(i * per, (i + 1) * per));
  return out;
}

function indexCapacity(contentH: number, contentW: number, columns: number, fontScale: number): number {
  const basePx = 10.5 * fontScale * (96 / 72);
  const rowPx = basePx * 0.82 * 1.62;
  const rows = Math.max(6, Math.floor((contentH - basePx * 2.4) / rowPx));
  return rows * Math.max(1, columns);
}
