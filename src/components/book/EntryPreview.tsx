"use client";

import type { Entry, Wordbook } from "@/lib/types";
import { isValueEmpty, sortSections } from "@/lib/sections";
import { EntryHeaderBlock, fontStackFor, SectionBlock, type CardCtx } from "@/components/export/blocks";
import { normalizeExportSettings, themeRootClass } from "@/lib/export/themes";

/**
 * 词条“成书样式”预览卡片：
 * 桌面端右侧预览面板与移动端编辑器的「预览」Tab 共用。
 */
export function EntryPreviewCard({ book, entry, className }: { book: Wordbook; entry: Entry; className?: string }) {
  // 旧值迁移：预览与导出必须同一套 settings（含 legacy cardStyle）
  const settings = normalizeExportSettings(book.exportSettings);
  const ctx: CardCtx = { settings, schema: book.schema };
  const sections = sortSections(book.schema.sections)
    .filter((sec) => settings.sectionVisibility[sec.id] ?? sec.visible)
    .filter((sec) => !settings.hideEmpty || !isValueEmpty(sec.type, entry.values[sec.key]));

  return (
    <div
      className={`wv-card rounded-xl bg-white p-4 shadow-geist-md ${themeRootClass(settings.cardStyle)} ${className ?? ""}`}
      style={{
        fontSize: `${10.5 * settings.fontScale}pt`,
        lineHeight: settings.lineHeight,
        fontFamily: fontStackFor(settings.fontFamily),
        color: "#1b1b1b",
      }}
    >
      <EntryHeaderBlock entry={entry} ctx={ctx} index={0} />
      <div className="mt-[0.7em] space-y-[0.55em]">
        {sections.map((sec) => (
          <SectionBlock key={sec.id} entry={entry} section={sec} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
