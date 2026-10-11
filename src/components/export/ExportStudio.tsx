"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  ChevronDown,
  ChevronLeft,
  Download,
  Ellipsis,
  FileDown,
  FileJson,
  LayoutGrid,
  Loader2,
  Palette,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import type { CardStyle, ExportSettings, Wordbook } from "@/lib/types";
import { ACCENTS, MARGIN_PRESETS, PAPERS, TONES } from "@/lib/paper";
import { sortSections } from "@/lib/sections";
import { EXPORT_THEMES, applyTheme, normalizeCardStyle } from "@/lib/export/themes";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Slider, SwitchRow } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccentPicker, SegmentedControl } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import { PrintDocument } from "@/components/export/PrintDocument";
import { ExportPresetDialog } from "@/components/export/ExportPresetDialog";
import { MeasureLayer, useExportDocument, type ExportProgress } from "@/components/export/useExportDocument";
import { capturePagesAsPng, exportBaseName, exportRasterPdf, printPages, zipFiles, dpiLabel } from "@/lib/export/print";
import { cx, downloadBlob } from "@/lib/utils";

type ExportPatch = Parameters<ReturnType<typeof useAppStore.getState>["updateExportSettings"]>[1];

/** 排版阶段文案（「确实没卡」的可读反馈） */
function phaseText(p: ExportProgress): string {
  switch (p.phase) {
    case "fonts":
      return "正在加载字体…";
    case "measure":
      return "正在测量排版…";
    case "paginate":
      return "正在分页…";
    default:
      return "正在排版…";
  }
}

/** 移动端底部工具抽屉的分组（参考图片编辑器的 Tab 式组织：按工作流分 4 组） */
const MOBILE_TABS = [
  { id: "layout", label: "版面", icon: SlidersHorizontal },
  { id: "cards", label: "卡片", icon: LayoutGrid },
  { id: "style", label: "外观", icon: Palette },
  { id: "extras", label: "细节", icon: Ellipsis },
] as const;

type MobileTab = (typeof MOBILE_TABS)[number]["id"];

export function ExportStudio({ book }: { book: Wordbook }) {
  const update = useAppStore((s) => s.updateExportSettings);
  const reset = useAppStore((s) => s.resetExportSettings);
  const settings = book.exportSettings;
  const doc = useExportDocument(book, settings);
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);

  const patch = (p: ExportPatch) => update(book.id, p);
  const baseName = useMemo(() => exportBaseName(book.name, PAPERS.find((p) => p.id === settings.paper)?.name ?? ""), [book.name, settings.paper]);

  // 小屏：首次进入自动适配页面宽度（最大化可视面积）
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const raf = requestAnimationFrame(() => {
      const fit = Math.min(0.6, Math.max(0.3, (window.innerWidth - 48) / doc.geometry.pageW));
      setZoom(Math.round(fit * 100) / 100);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pagesElements = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-wv-page]") ?? []);

  const runWithProgress = async (label: string, fn: (onProgress: (d: number, t: number) => void) => Promise<void>) => {
    try {
      setProgress({ label, done: 0, total: 1 });
      await fn((done, total) => setProgress({ label, done, total }));
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const onPrint = () =>
    runWithProgress("准备打印…", async () => {
      const root = rootRef.current;
      if (!root) return;
      await printPages(root, doc.geometry.paperMm, book.name);
      toast.info("已打开打印窗口", { description: "目标选「另存为 PDF」；边距选「无」、缩放 100%、勾选「背景图形」" });
    });

  const onRasterPdf = () =>
    runWithProgress("生成图片型 PDF…", async (onProgress) => {
      const els = pagesElements();
      if (!els.length) throw new Error("没有可导出的页面");
      const blob = await exportRasterPdf(els, doc.geometry.paperMm, { pixelRatio: 2.5, onProgress });
      downloadBlob(`${baseName}.pdf`, blob);
      toast.success(`已导出 ${els.length} 页图片型 PDF`);
    });

  const onPng = (pixelRatio: number, zipped: boolean) =>
    runWithProgress(zipped ? "导出 PNG 压缩包…" : "导出 PNG…", async (onProgress) => {
      const els = pagesElements();
      if (!els.length) throw new Error("没有可导出的页面");
      const blobs = await capturePagesAsPng(els, { pixelRatio, backgroundColor: TONES[settings.tone].bg, onProgress });
      if (zipped) {
        const files = blobs.map((blob, i) => ({ name: `${baseName}-p${String(i + 1).padStart(3, "0")}.png`, blob }));
        const zip = await zipFiles(files);
        downloadBlob(`${baseName}-png.zip`, zip);
        toast.success(`已导出 ${blobs.length} 页 PNG（ZIP）· ${dpiLabel(pixelRatio)}`);
      } else {
        blobs.forEach((blob, i) => downloadBlob(`${baseName}-p${String(i + 1).padStart(3, "0")}.png`, blob));
        toast.success(`已导出 ${blobs.length} 页 PNG · ${dpiLabel(pixelRatio)}`);
      }
    });

  const panelProps = {
    settings,
    patch,
    book,
    onReset: () => {
      reset(book.id);
      toast.success("已恢复默认导出设置");
    },
  };

  return (
    <div className="flex h-dvh flex-col bg-background-100">
      {/* 顶部工具栏 */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-300 px-3 py-2 lg:h-14 lg:flex-nowrap lg:px-4 lg:py-0">
        <IconButton label="返回词库" onClick={() => window.history.back()}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <div className="min-w-0">
          <div className="t-h-14 truncate">{book.name} · 导出工作室</div>
          <div className="t-label-12 text-gray-800">
            {PAPERS.find((p) => p.id === settings.paper)?.name}
            {" · "}
            {settings.orientation === "portrait" ? "纵向" : "横向"}
            {" · "}
            {settings.layout === "flow" ? `${settings.columns} 栏流式` : `${settings.grid.columns}×${settings.grid.rows} 网格`}
            {doc.plan ? ` · ${doc.plan.pages.length + (settings.cover.enabled ? 1 : 0)} 页` : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={onRasterPdf} loading={progress?.label.includes("图片型")}>
            <FileDown className="size-4" /> 一键图片 PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="md">
                <Download className="size-4" /> PNG <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>清晰度</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void onPng(2, true)}>192 DPI · ZIP 压缩包</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onPng(3.125, true)}>300 DPI · ZIP 压缩包（打印推荐）</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onPng(4, true)}>384 DPI · ZIP 压缩包</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onPng(3.125, false)}>300 DPI · 逐页下载</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="md" className="shrink-0" onClick={onPrint}>
            <Printer className="size-4" /> 打印
            <span className="hidden sm:inline"> / 矢量 PDF</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 桌面端：侧栏设置面板（移动端由底部工具抽屉替代） */}
        <aside className="hidden shrink-0 overflow-y-auto border-r border-gray-300 px-4 py-4 scroll-thin lg:block lg:w-[336px]">
          <PanelsLayout {...panelProps} />
          <PanelsCards {...panelProps} />
          <PanelsAppearance {...panelProps} />
          <PanelsExtras {...panelProps} />
        </aside>

        {/* 预览区 */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background-200 grid-bg">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="flex min-h-full items-start justify-center py-6 lg:py-8">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                {doc.ready ? (
                  <div ref={rootRef}>
                    <PrintDocument book={book} doc={doc} />
                  </div>
                ) : (
                  <div className="flex h-96 w-[420px] flex-col items-center justify-center gap-3 rounded-xl bg-background-100 px-6 shadow-geist-border">
                    <Loader2 className="size-5 animate-spin text-gray-700" />
                    <span className="t-label-13 text-gray-800">{phaseText(doc.progress)}</span>
                    {doc.progress.phase === "measure" && doc.progress.total > 0 ? (
                      <div className="w-full max-w-[280px] space-y-1.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-gray-1000 transition-[width] duration-150"
                            style={{ width: `${Math.round((doc.progress.done / doc.progress.total) * 100)}%` }}
                          />
                        </div>
                        <div className="t-mono-12 text-center text-gray-700">
                          已测量 {doc.progress.done} / {doc.progress.total} 块
                        </div>
                      </div>
                    ) : null}
                    <span className="t-label-12 text-gray-700">词库越大这一步越久；期间界面可以正常操作。</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 已就绪但正在重测量（滑杆防抖/离散改动）：盖一枚轻量提示，旧预览保持可见 */}
          {doc.ready && doc.pending ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-gray-1000/85 px-3 py-1.5 t-label-12 text-background-100 shadow-geist-md">
              <Loader2 className="size-3.5 animate-spin" /> 正在更新排版…
            </div>
          ) : null}

          {/* 缩放控制：停靠在预览区底部，不遮挡页面内容 */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-300 bg-background-100 px-3 py-2 sm:px-4">
            <span className="t-label-12 text-gray-800">缩放</span>
            <Slider
              className="w-36 sm:w-56"
              ariaLabel="预览缩放"
              min={0.3}
              max={1.5}
              step={0.05}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
            />
            <span className="t-mono-12 w-10 text-right text-gray-800">{Math.round(zoom * 100)}%</span>
          </div>
        </main>
      </div>

      {/* 移动端：底部 Tab 工具抽屉（非模态，预览常驻；面板按工作流分组） */}
      <div className="shrink-0 border-t border-gray-300 bg-background-100 lg:hidden">
        {mobileTab ? (
          <div
            id="wv-mobile-panel"
            role="tabpanel"
            aria-label={`${MOBILE_TABS.find((t) => t.id === mobileTab)?.label}设置`}
            className="max-h-[46vh] overflow-y-auto overscroll-contain border-b border-gray-300 px-3 pb-3 pt-1 scroll-thin"
          >
            <div className="sticky -top-px z-10 -mx-3 mb-1 flex items-center justify-between border-b border-gray-300 bg-background-100 px-3 py-1.5">
              <span className="t-h-14">{MOBILE_TABS.find((t) => t.id === mobileTab)?.label}</span>
              <button
                type="button"
                aria-label="收起面板"
                onClick={() => setMobileTab(null)}
                className="grid size-8 place-items-center rounded-md text-gray-800 hover:bg-gray-100 hover:text-gray-1000"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            {mobileTab === "layout" ? <PanelsLayout {...panelProps} /> : null}
            {mobileTab === "cards" ? <PanelsCards {...panelProps} /> : null}
            {mobileTab === "style" ? <PanelsAppearance {...panelProps} /> : null}
            {mobileTab === "extras" ? <PanelsExtras {...panelProps} /> : null}
          </div>
        ) : null}
        <nav role="tablist" aria-label="导出设置分组" className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_TABS.map((t) => {
            const active = mobileTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="wv-mobile-panel"
                onClick={() => setMobileTab((cur) => (cur === t.id ? null : t.id))}
                className={cx(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                  active ? "font-medium text-gray-1000" : "text-gray-800 hover:bg-gray-100/60",
                )}
              >
                <span
                  className={cx(
                    "flex h-5 w-12 items-center justify-center rounded-full transition-colors",
                    active ? "bg-blue-100" : "",
                  )}
                >
                  <Icon className={cx("size-4", active ? "text-blue-900" : "")} />
                </span>
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 进度遮罩（移动端抬高避开底部工具抽屉） */}
      {progress ? (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-xl bg-background-100 px-5 py-3 shadow-geist-modal sm:bottom-6">
          <div className="flex items-center gap-3">
            <FileJson className="size-4 text-gray-800" />
            <div>
              <div className="t-label-13">{progress.label}</div>
              <div className="mt-1 h-1.5 w-56 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-700 transition-[width]"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
            </div>
            <span className="t-mono-12 text-gray-800">
              {progress.done}/{progress.total}
            </span>
          </div>
        </div>
      ) : null}

      {/* 隐藏测量层 */}
      <MeasureLayer doc={doc} />
    </div>
  );
}

/* ---------------- 设置面板（桌面侧栏与移动抽屉共用；模块级定义以保留折叠状态） ---------------- */

interface PanelGroupProps {
  settings: ExportSettings;
  patch: (p: ExportPatch) => void;
  book: Wordbook;
  onReset: () => void;
}

/** 版面：导出预设 · 纸张与方向 · 页边距与装订 · 版式 */
function PanelsLayout({ settings, patch, book }: PanelGroupProps) {
  const [presetOpen, setPresetOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-background-200 px-3 py-2.5">
        <div className="min-w-0">
          <div className="t-label-13 font-medium text-gray-900">导出预设</div>
          <div className="t-label-12 text-gray-700">调好这版就存下来，换词库时一键套用</div>
        </div>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setPresetOpen(true)}>
          <BookMarked className="size-3.5" /> 管理
        </Button>
      </div>
      <Panel title="纸张与方向" defaultOpen>
        <Field label="纸张尺寸">
          <Select
            value={settings.paper}
            onValueChange={(v) => patch({ paper: v as ExportSettings["paper"] })}
            options={PAPERS.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.width}×${p.height}mm${p.note ? `（${p.note}）` : ""}`,
            }))}
          />
        </Field>
        {settings.paper === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="宽 (mm)">
              <Input
                type="number"
                inputMode="decimal"
                value={settings.customPaper?.width ?? 200}
                onChange={(e) => patch({ customPaper: { width: Number(e.target.value), height: settings.customPaper?.height ?? 260 } })}
              />
            </Field>
            <Field label="高 (mm)">
              <Input
                type="number"
                inputMode="decimal"
                value={settings.customPaper?.height ?? 260}
                onChange={(e) => patch({ customPaper: { width: settings.customPaper?.width ?? 200, height: Number(e.target.value) } })}
              />
            </Field>
          </div>
        ) : null}
        <Field label="方向">
          <SegmentedControl
            value={settings.orientation}
            onValueChange={(v) => patch({ orientation: v })}
            options={[
              { value: "portrait", label: "纵向" },
              { value: "landscape", label: "横向" },
            ]}
            grow
          />
        </Field>
        <Field label="纸张色调">
          <SegmentedControl
            value={settings.tone}
            onValueChange={(v) => patch({ tone: v })}
            options={(Object.keys(TONES) as (keyof typeof TONES)[]).map((id) => ({ value: id, label: TONES[id].name, title: TONES[id].hint }))}
            grow
          />
        </Field>
      </Panel>

      <Panel title="页边距与装订">
        <Field label="边距预设">
          <Select
            value=""
            placeholder="选择预设…"
            onValueChange={(v) => {
              const preset = MARGIN_PRESETS.find((p) => p.id === v);
              if (preset) patch({ margin: preset.margin });
            }}
            options={MARGIN_PRESETS.map((p) => ({ value: p.id, label: `${p.name} — ${p.hint}` }))}
          />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((k) => (
            <Field key={k} label={{ top: "上", right: "右", bottom: "下", left: "左" }[k]}>
              <Input
                type="number"
                inputMode="decimal"
                className="h-8 px-2 text-[13px]"
                value={settings.margin[k]}
                onChange={(e) => patch({ margin: { [k]: Number(e.target.value) } })}
              />
            </Field>
          ))}
        </div>
        <Field label="装订留白 (mm)" hint="胶装 / 线圈装订时内侧额外留白">
          <Input
            type="number"
            inputMode="decimal"
            value={settings.margin.gutter}
            onChange={(e) => patch({ margin: { gutter: Number(e.target.value) } })}
          />
        </Field>
        <SwitchRow
          label="双面镜像"
          hint="奇偶页左右镜像，双面打印翻转长边"
          checked={settings.margin.mirror}
          onCheckedChange={(v) => patch({ margin: { mirror: v } })}
        />
      </Panel>

      <Panel title="版式">
        <Field label="分页模式" hint="对齐：每个词的题头尽量落在页首；连续：页面填满优先，换页只在整块或整条装不下时发生">
          <SegmentedControl
            value={settings.paginationMode ?? "align"}
            onValueChange={(v) => patch({ paginationMode: v })}
            options={[
              { value: "align", label: "题头对齐" },
              { value: "continuous", label: "连续填充" },
            ]}
            grow
          />
        </Field>
        <Field label="布局模式">
          <SegmentedControl
            value={settings.layout}
            onValueChange={(v) => patch({ layout: v })}
            options={[
              { value: "flow", label: "流式分栏" },
              { value: "grid", label: "网格闪卡" },
            ]}
            grow
          />
        </Field>
        {settings.layout === "flow" ? (
          <>
            <Field label="分栏数" hint="双栏排版接近纸本词典的阅读体验">
              <SegmentedControl
                value={String(settings.columns)}
                onValueChange={(v) => patch({ columns: Number(v) as 1 | 2 | 3 })}
                options={[
                  { value: "1", label: "1 栏" },
                  { value: "2", label: "2 栏" },
                  { value: "3", label: "3 栏" },
                ]}
                grow
              />
            </Field>
            <SliderRow label="栏间距" value={settings.columnGap} min={4} max={16} step={1} suffix="mm" onChange={(v) => patch({ columnGap: v })} />
            {normalizeCardStyle(settings.cardStyle) === "dictionary" && settings.columns === 1 ? (
              <div className="t-label-12 text-gray-700">内容宽 ≥165mm（如 A4）时会自动排成 2 栏</div>
            ) : null}
            <SliderRow label="词条间距" value={settings.entryGap} min={0} max={16} step={0.5} suffix="mm" onChange={(v) => patch({ entryGap: v })} />
          </>
        ) : (
          <>
            <SliderRow label="网格列数" value={settings.grid.columns} min={1} max={4} step={1} onChange={(v) => patch({ grid: { columns: v } })} />
            <SliderRow label="网格行数" value={settings.grid.rows} min={2} max={10} step={1} onChange={(v) => patch({ grid: { rows: v } })} />
            <SliderRow label="网格间距" value={settings.grid.gapMm ?? 4} min={2} max={16} step={1} suffix="mm" onChange={(v) => patch({ grid: { gapMm: v } })} />
            <SwitchRow label="显示单元格边框" checked={settings.grid.showBorder} onCheckedChange={(v) => patch({ grid: { showBorder: v } })} />
            <SwitchRow
              label="闪卡精简模式"
              hint="只显示头部与前两个字段"
              checked={settings.grid.flashcard}
              onCheckedChange={(v) => patch({ grid: { flashcard: v } })}
            />
          </>
        )}
      </Panel>
      <ExportPresetDialog book={book} open={presetOpen} onOpenChange={setPresetOpen} />
    </>
  );
}

/** 主题缩略骨架图（固定灰阶 + 少量强调点，避免"换色"认知） */
function ThemeThumb({ id }: { id: CardStyle }) {
  const line = "bg-gray-400/70";
  if (id === "dictionary") {
    return (
      <div className="h-14 w-full rounded bg-background-200 p-2">
        <div className={cx("h-[2px] w-2/5 rounded", line)} />
        <div className="mt-1.5 space-y-[3px]">
          <div className="flex items-center gap-[3px]">
            <span className="font-mono text-[8px] text-gray-700">1.</span>
            <div className={cx("h-[1px] flex-1 rounded", line)} />
          </div>
          <div className="pl-[11px]">
            <div className={cx("h-[1px] w-4/5 rounded", line)} />
          </div>
          <div className="flex items-center gap-[3px]">
            <span className="font-mono text-[8px] text-gray-700">2.</span>
            <div className={cx("h-[1px] flex-1 rounded", line)} />
          </div>
          <div className="pl-[11px]">
            <div className={cx("h-[1px] w-3/5 rounded", line)} />
          </div>
        </div>
      </div>
    );
  }
  if (id === "swiss") {
    return (
      <div className="flex h-14 w-full flex-col justify-between rounded bg-background-200 p-2">
        <div className={cx("h-[2px] w-1/3 rounded", line)} />
        <div className={cx("h-[1px] w-1/2 rounded", line)} />
        <div className="pl-4">
          <div className={cx("h-[1px] w-1/3 rounded", line)} />
        </div>
        <div className={cx("h-[1px] w-1/4 rounded", line)} />
      </div>
    );
  }
  if (id === "notebook") {
    return (
      <div className="relative h-14 w-full overflow-hidden rounded bg-background-200 p-2">
        <div className="absolute inset-x-2 top-2 space-y-[5px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={cx("h-[1px] w-full opacity-45", line)} />
          ))}
        </div>
        <div className="relative">
          <span className="inline-block rotate-[-1.2deg] rounded-[3px] bg-blue-100 px-1.5 py-[1px] text-[8px] text-blue-900">标签</span>
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-14 w-full grid-cols-2 gap-2 rounded bg-background-200 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded border border-gray-400/60" />
      ))}
    </div>
  );
}

/** 卡片：卡片样式 · 字段显示 */
function PanelsCards({ settings, patch, book }: PanelGroupProps) {
  const visibleSections = sortSections(book.schema.sections);
  const [applyDefaults, setApplyDefaults] = useState(true);
  return (
    <>
      <Panel title="卡片样式" defaultOpen>
        <Field label="版式风格">
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_THEMES.map((t) => {
              const active = normalizeCardStyle(settings.cardStyle) === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (applyDefaults) {
                      patch(applyTheme(settings, t.id));
                      toast.success(`已切换到「${t.name}」，并应用结构默认值`, { description: t.signature });
                    } else {
                      patch({ cardStyle: t.id });
                    }
                  }}
                  className={cx(
                    "rounded-lg border p-2 text-left transition-colors",
                    active ? "border-blue-600/60 bg-blue-100" : "border-gray-300 bg-background-100 hover:bg-gray-100",
                  )}
                >
                  <ThemeThumb id={t.id} />
                  <div className="t-label-13 mt-1.5 font-medium text-gray-1000">{t.name}</div>
                  <div className="t-label-12 text-gray-700">{t.signature}</div>
                </button>
              );
            })}
          </div>
          <SwitchRow
            label="切换时应用结构默认值"
            hint="字体、字号、行距、间距、分页与网格随主题调整；之后仍可逐项微调"
            checked={applyDefaults}
            onCheckedChange={setApplyDefaults}
          />
        </Field>
        <Field label="字体">
          <SegmentedControl
            value={settings.fontFamily}
            onValueChange={(v) => patch({ fontFamily: v })}
            options={[
              { value: "sans", label: "无衬线", title: "英文 Geist Variable · 中文 HarmonyOS Sans" },
              { value: "serif", label: "衬线", title: "英文 Georgia / Times · 中文思源宋体" },
            ]}
            grow
          />
        </Field>
        <SliderRow label="字号" value={settings.fontScale * 100} min={85} max={130} step={5} suffix="%" onChange={(v) => patch({ fontScale: v / 100 })} />
        <SliderRow label="行高" value={settings.lineHeight * 100} min={140} max={200} step={5} suffix="%" onChange={(v) => patch({ lineHeight: v / 100 })} />
        <SliderRow label="手写横线" value={settings.writingLines} min={0} max={6} step={1} suffix="行" onChange={(v) => patch({ writingLines: v })} />
        <SwitchRow label="字段小标题" checked={settings.showSectionLabels} onCheckedChange={(v) => patch({ showSectionLabels: v })} />
        <SwitchRow label="隐藏空字段" hint="关闭后空字段留白，可打印成手写词卡" checked={settings.hideEmpty} onCheckedChange={(v) => patch({ hideEmpty: v })} />
        <SwitchRow label="词条编号" checked={settings.showEntryNumber} onCheckedChange={(v) => patch({ showEntryNumber: v })} />
        <SwitchRow label="跨页续标" hint="词条跨页时显示「续」" checked={settings.continuationMark} onCheckedChange={(v) => patch({ continuationMark: v })} />
        <Field label="单词大小写">
          <Select
            value={settings.headwordCase}
            onValueChange={(v) => patch({ headwordCase: v as ExportSettings["headwordCase"] })}
            options={[
              { value: "as-is", label: "保持原样" },
              { value: "lower", label: "小写" },
              { value: "upper", label: "大写" },
              { value: "title", label: "首字母大写" },
            ]}
          />
        </Field>
        <Field label="排序">
          <SegmentedControl
            value={settings.sortMode}
            onValueChange={(v) => patch({ sortMode: v })}
            options={[
              { value: "list", label: "列表顺序" },
              { value: "az", label: "字母序" },
            ]}
            grow
          />
        </Field>
      </Panel>

      <Panel title="字段显示" desc={`共 ${visibleSections.length} 个字段`}>
        <div className="space-y-1">
          {visibleSections.map((sec) => (
            <SwitchRow
              key={sec.id}
              label={sec.label}
              checked={settings.sectionVisibility[sec.id] ?? sec.visible}
              onCheckedChange={(v) => patch({ sectionVisibility: { [sec.id]: v } })}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}

/** 外观：主题强调色 · 封面 */
function PanelsAppearance({ settings, patch, book }: PanelGroupProps) {
  return (
    <>
      <Panel title="主题强调色" defaultOpen>
        <AccentPicker value={settings.accent} onChange={(v) => patch({ accent: v })} />
        <p className="t-label-12 mt-2 text-gray-700">当前：{ACCENTS[settings.accent].name}（{ACCENTS[settings.accent].hex}）</p>
      </Panel>

      <Panel title="封面">
        <SwitchRow label="启用封面" checked={settings.cover.enabled} onCheckedChange={(v) => patch({ cover: { enabled: v, title: settings.cover.title || book.name } })} />
        {settings.cover.enabled ? (
          <>
            <Field label="封面样式">
              <Select
                value={settings.cover.style}
                onValueChange={(v) => patch({ cover: { style: v as ExportSettings["cover"]["style"] } })}
                options={[
                  { value: "minimal", label: "极简居中" },
                  { value: "band", label: "色带横幅" },
                  { value: "boxed", label: "边框经典" },
                  { value: "typewriter", label: "打字机" },
                ]}
              />
            </Field>
            <Field label="标题">
              <Input value={settings.cover.title} onChange={(e) => patch({ cover: { title: e.target.value } })} placeholder={book.name} />
            </Field>
            <Field label="副标题">
              <Input value={settings.cover.subtitle} onChange={(e) => patch({ cover: { subtitle: e.target.value } })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="作者 / 署名">
                <Input value={settings.cover.author} onChange={(e) => patch({ cover: { author: e.target.value } })} />
              </Field>
              <Field label="日期文本">
                <Input value={settings.cover.dateText} onChange={(e) => patch({ cover: { dateText: e.target.value } })} />
              </Field>
            </div>
          </>
        ) : null}
      </Panel>
    </>
  );
}

/** 细节：页脚 · 索引 · 恢复默认 */
function PanelsExtras({ settings, patch, onReset }: PanelGroupProps) {
  return (
    <>
      <Panel title="页脚">
        <SwitchRow label="显示页码" checked={settings.footer.pageNumbers} onCheckedChange={(v) => patch({ footer: { pageNumbers: v } })} />
        <Field label="页脚文字">
          <Input value={settings.footer.text} onChange={(e) => patch({ footer: { text: e.target.value } })} placeholder="如：WulonVocab · 我的单词本" />
        </Field>
        <SwitchRow label="页脚显示词库名" checked={settings.footer.bookName} onCheckedChange={(v) => patch({ footer: { bookName: v } })} />
      </Panel>

      <Panel title="索引">
        <SwitchRow label="生成索引页" checked={settings.index.enabled} onCheckedChange={(v) => patch({ index: { enabled: v } })} />
        {settings.index.enabled ? (
          <>
            <Field label="索引标题">
              <Input value={settings.index.title} onChange={(e) => patch({ index: { title: e.target.value } })} />
            </Field>
            <SliderRow label="索引列数" value={settings.index.columns} min={1} max={4} step={1} onChange={(v) => patch({ index: { columns: v } })} />
            <SwitchRow label="显示页码" checked={settings.index.showPageNumbers} onCheckedChange={(v) => patch({ index: { showPageNumbers: v } })} />
          </>
        ) : null}
      </Panel>

      <div className="pb-6 pt-2">
        <Button variant="secondary" className="w-full" onClick={onReset}>
          恢复默认设置
        </Button>
      </div>
    </>
  );
}

/* ---------------- 小部件 ---------------- */

function Panel({ title, desc, children, defaultOpen = false }: { title: string; desc?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-gray-300 py-3 first:pt-0 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="t-h-14">{title}</div>
          {desc ? <div className="t-label-12 text-gray-800">{desc}</div> : null}
        </div>
        <ChevronDown className={cx("size-4 text-gray-800 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open ? (
        <div id={id} className="mt-3 space-y-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="t-label-13 text-gray-900">{label}</span>
        <span className="t-mono-12 text-gray-800">
          {Math.round(value * 100) / 100}
          {suffix ?? ""}
        </span>
      </div>
      <Slider ariaLabel={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
