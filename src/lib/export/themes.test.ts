import { describe, expect, it } from "vitest";
import type { ExportSettings } from "../types";
import { defaultExportSettings } from "../presets";
import { applyTheme, effectiveColumns, normalizeCardStyle, normalizeExportSettings, themeRootClass } from "./themes";

describe("导出主题：迁移与结构预设", () => {
  it("旧 cardStyle 值映射（classic→辞书体、minimal→瑞士、compact 退役）", () => {
    expect(normalizeCardStyle("classic")).toBe("dictionary");
    expect(normalizeCardStyle("minimal")).toBe("swiss");
    expect(normalizeCardStyle("compact")).toBe("dictionary");
    expect(normalizeCardStyle("notebook")).toBe("notebook");
    expect(normalizeCardStyle("flashcard")).toBe("flashcard");
    expect(normalizeCardStyle(undefined)).toBe("dictionary");
  });

  it("normalizeExportSettings：已迁移数据保持原引用；旧数据补齐 gapMm", () => {
    const base = defaultExportSettings("测试");
    expect(normalizeExportSettings(base)).toBe(base);
    const legacy = {
      ...base,
      cardStyle: "classic",
      grid: { ...base.grid, gapMm: undefined },
    } as unknown as ExportSettings;
    const fixed = normalizeExportSettings(legacy);
    expect(fixed.cardStyle).toBe("dictionary");
    expect(fixed.grid.gapMm).toBe(4);
  });

  it("闪卡主题：写入网格与版式默认值", () => {
    const s = applyTheme(defaultExportSettings("测试"), "flashcard");
    expect(s.layout).toBe("grid");
    expect(s.grid.gapMm).toBe(10);
    expect(s.grid.flashcard).toBe(true);
    expect(s.showSectionLabels).toBe(false);
  });

  it("手账主题：米黄纸 + 书写线", () => {
    const s = applyTheme(defaultExportSettings("测试"), "notebook");
    expect(s.tone).toBe("cream");
    expect(s.writingLines).toBe(3);
  });

  it("辞书体宽页自动双栏：≥165mm 且 1 栏时生效；其余主题/多栏/窄页不变", () => {
    expect(effectiveColumns("dictionary", "flow", 1, 184)).toBe(2);
    expect(effectiveColumns("dictionary", "flow", 1, 150)).toBe(1);
    expect(effectiveColumns("dictionary", "flow", 3, 184)).toBe(3);
    expect(effectiveColumns("swiss", "flow", 1, 184)).toBe(1);
    expect(effectiveColumns("dictionary", "grid", 1, 184)).toBe(1);
  });

  it("主题根类名：仅瑞士挂 wv-swiss", () => {
    expect(themeRootClass("swiss")).toBe("wv-swiss");
    expect(themeRootClass("dictionary")).toBe("");
    expect(themeRootClass("notebook")).toBe("");
    expect(themeRootClass("flashcard")).toBe("");
  });
});
