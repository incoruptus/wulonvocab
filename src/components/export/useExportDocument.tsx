"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entry, ExportSettings, SectionDef, SectionType, Wordbook } from "@/lib/types";
import { computeGeometry, getPaperBox, mmToPx } from "@/lib/paper";
import { isValueEmpty, sortSections, valueLength } from "@/lib/sections";
import { paginate, type MeasuredBlock, type PaginationResult } from "@/lib/export/paginate";
import { EntryHeaderBlock, SectionBlock, type CardCtx } from "@/components/export/blocks";

const SPLITTABLE_TYPES: SectionType[] = ["senses", "examples", "keyvalue", "transforms", "image", "list", "tags", "table"];

export interface BlockSpec {
  id: string;
  entryId: string;
  entry: Entry;
  entryIndex: number;
  kind: "header" | "section";
  section?: SectionDef;
  gapBefore: number;
  splittable: boolean;
  unitRanges: [number, number][];
}

export interface ExportGeometry {
  paperMm: { width: number; height: number };
  pageW: number;
  pageH: number;
  contentW: number;
  contentH: number;
  slotW: number;
  columnGapPx: number;
  marginPx: { top: number; right: number; bottom: number; left: number; gutter: number };
  pageFontCss: string;
}

export interface ExportDocument {
  ready: boolean;
  mode: "flow" | "grid";
  ctx: CardCtx;
  entries: Entry[];
  sections: SectionDef[];
  specs: BlockSpec[];
  geometry: ExportGeometry;
  plan: PaginationResult | null;
  gridPerPage: number;
  measureKey: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  heights: Map<string, number>;
}

function visibleSections(schema: Wordbook["schema"], settings: ExportSettings): SectionDef[] {
  return sortSections(schema.sections).filter((sec) => settings.sectionVisibility[sec.id] ?? sec.visible);
}

function addSectionLabel(type: SectionType): boolean {
  return type !== "divider";
}

function unitRangesFor(type: SectionType, value: unknown, groupByPos: boolean): [number, number][] {
  void groupByPos;
  const n = valueLength(type, value);
  if (n <= 1) return [];
  // 统一按「单个条目」为分页单元：义项、例句、行……
  // 渲染端会为每个切片重新渲染所属词性标记，续页依然清晰；
  // 测量含标题的单元高度略大于实际拼接块，属安全的高估（宁可早换页，不溢出）。
  return Array.from({ length: n }, (_, i) => [i, i + 1] as [number, number]);
}

export function useExportDocument(book: Wordbook, settings: ExportSettings): ExportDocument {
  const elsRef = useRef(new Map<string, HTMLElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) elsRef.current.set(id, el);
      else elsRef.current.delete(id);
    },
    [],
  );

  const geometry = useMemo<ExportGeometry>(() => {
    const box =
      settings.paper === "custom" && settings.customPaper ? settings.customPaper : getPaperBox(settings.paper);
    const g = computeGeometry(box, settings.orientation, settings.margin, settings.columns, settings.columnGap);
    return {
      paperMm: { width: g.page.width, height: g.page.height },
      pageW: mmToPx(g.page.width),
      pageH: mmToPx(g.page.height),
      contentW: mmToPx(g.content.width),
      contentH: mmToPx(g.content.height),
      slotW: mmToPx(g.columnWidth),
      columnGapPx: mmToPx(settings.columnGap),
      marginPx: {
        top: mmToPx(settings.margin.top),
        right: mmToPx(settings.margin.right),
        bottom: mmToPx(settings.margin.bottom),
        left: mmToPx(settings.margin.left),
        gutter: mmToPx(settings.margin.gutter),
      },
      pageFontCss: `${(10.5 * settings.fontScale).toFixed(2)}pt`,
    };
  }, [settings.paper, settings.customPaper, settings.orientation, settings.margin, settings.columns, settings.columnGap, settings.fontScale]);

  const entries = useMemo(() => {
    const list = [...book.entries];
    if (settings.sortMode === "az") {
      list.sort((a, b) => a.headword.toLowerCase().localeCompare(b.headword.toLowerCase()));
    }
    return list;
  }, [book.entries, settings.sortMode]);

  const sections = useMemo(() => visibleSections(book.schema, settings), [book.schema, settings]);

  const specs = useMemo<BlockSpec[]>(() => {
    const out: BlockSpec[] = [];
    const entryGapPx = mmToPx(settings.entryGap);
    const intraGapPx = mmToPx(settings.cardStyle === "compact" ? 1.6 : 2.4);
    entries.forEach((entry, entryIndex) => {
      out.push({
        id: `h:${entry.id}`,
        entryId: entry.id,
        entry,
        entryIndex,
        kind: "header",
        gapBefore: 0,
        splittable: false,
        unitRanges: [],
      });
      for (const section of sections) {
        if (!addSectionLabel(section.type)) {
          out.push({
            id: `s:${entry.id}:${section.id}`,
            entryId: entry.id,
            entry,
            entryIndex,
            kind: "section",
            section,
            gapBefore: intraGapPx,
            splittable: false,
            unitRanges: [],
          });
          continue;
        }
        const value = entry.values[section.key];
        const empty = isValueEmpty(section.type, value);
        if (empty && settings.hideEmpty) continue;
        const splittable =
          !empty && SPLITTABLE_TYPES.includes(section.type) && valueLength(section.type, value) > 1;
        out.push({
          id: `s:${entry.id}:${section.id}`,
          entryId: entry.id,
          entry,
          entryIndex,
          kind: "section",
          section,
          gapBefore: intraGapPx,
          splittable,
          unitRanges: splittable
            ? unitRangesFor(section.type, value, section.options.groupByPos !== false)
            : [],
        });
      }
    });
    // 词条间距：每个词条头部之前（除第一个）用 entryGap
    let lastEntry: string | null = null;
    for (const spec of out) {
      if (spec.kind === "header") {
        spec.gapBefore = lastEntry === null ? 0 : entryGapPx;
        lastEntry = spec.entryId;
      }
    }
    return out;
  }, [entries, sections, settings.entryGap, settings.cardStyle, settings.hideEmpty]);

  const measureKey = useMemo(
    () =>
      [
        book.id,
        book.updatedAt,
        entries.length,
        sections.map((s) => s.id).join(","),
        settings.fontScale,
        settings.fontFamily,
        settings.cardStyle,
        settings.lineHeight,
        settings.showSectionLabels,
        settings.hideEmpty,
        settings.writingLines,
        geometry.slotW.toFixed(1),
        settings.columns,
        settings.layout,
      ].join("|"),
    [book.id, book.updatedAt, entries.length, sections, settings, geometry.slotW],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          const next = new Map<string, number>();
          for (const [id, el] of elsRef.current) {
            next.set(id, el.getBoundingClientRect().height);
          }
          setHeights(next);
        });
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [measureKey]);

  const plan = useMemo<PaginationResult | null>(() => {
    if (settings.layout === "grid") return null;
    if (!specs.length) return { pages: [{ index: 0, slots: [[]] }], entryFirstPage: {}, overflowBlocks: 0 };
    const measured: MeasuredBlock[] = [];
    for (const spec of specs) {
      if (!spec.splittable) {
        const h = heights.get(spec.id);
        if (h === undefined) return null;
        measured.push({
          id: spec.id,
          entryId: spec.entryId,
          kind: spec.kind,
          sectionId: spec.section?.id,
          height: h,
          gapBefore: spec.gapBefore,
          glueWithNext: spec.kind === "header",
        });
      } else {
        const headerH = heights.get(`${spec.id}#h`);
        if (headerH === undefined) return null;
        const units: { from: number; to: number; h: number }[] = [];
        for (let i = 0; i < spec.unitRanges.length; i += 1) {
          const uh = heights.get(`${spec.id}#u${i}`);
          if (uh === undefined) return null;
          units.push({ from: spec.unitRanges[i][0], to: spec.unitRanges[i][1], h: uh - headerH });
        }
        const total = headerH + units.reduce((acc, u) => acc + u.h, 0);
        measured.push({
          id: spec.id,
          entryId: spec.entryId,
          kind: spec.kind,
          sectionId: spec.section?.id,
          height: total,
          split: { header: headerH, units },
          gapBefore: spec.gapBefore,
        });
      }
    }
    return paginate(measured, {
      columns: settings.columns,
      columnHeight: geometry.contentH,
      mode: settings.paginationMode ?? "align",
    });
  }, [specs, heights, settings.columns, settings.layout, settings.paginationMode, geometry.contentH]);

  const ready = settings.layout === "grid" ? true : plan !== null;

  return {
    ready,
    mode: settings.layout,
    ctx: { settings, schema: book.schema },
    entries,
    sections,
    specs,
    geometry,
    plan,
    gridPerPage: Math.max(1, settings.grid.columns * settings.grid.rows),
    measureKey,
    register,
    heights,
  };
}

/* ============================================================
   测量层：与实际渲染完全同构的隐藏 DOM
   ============================================================ */

export function MeasureLayer({ doc }: { doc: ExportDocument }) {
  const { specs, ctx, geometry, register } = doc;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -100000,
        top: 0,
        width: geometry.slotW,
        visibility: "hidden",
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      <div style={{ fontSize: geometry.pageFontCss, lineHeight: ctx.settings.lineHeight }}>
        {specs.map((spec) => {
          if (spec.kind === "header") {
            return (
              <div key={spec.id} ref={register(spec.id)} style={{ marginTop: spec.gapBefore }}>
                <EntryHeaderBlock entry={spec.entry} ctx={ctx} index={spec.entryIndex} />
              </div>
            );
          }
          const section = spec.section!;
          if (!spec.splittable) {
            return (
              <div key={spec.id} ref={register(spec.id)} style={{ marginTop: spec.gapBefore }}>
                <SectionBlock entry={spec.entry} section={section} ctx={ctx} />
              </div>
            );
          }
          return (
            <div key={spec.id}>
              <div ref={register(`${spec.id}#h`)} style={{ marginTop: spec.gapBefore }}>
                <SectionBlock entry={spec.entry} section={section} ctx={ctx} headerOnly />
              </div>
              {spec.unitRanges.map((range, i) => (
                <div key={i} ref={register(`${spec.id}#u${i}`)}>
                  <SectionBlock entry={spec.entry} section={section} ctx={ctx} slice={range} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
