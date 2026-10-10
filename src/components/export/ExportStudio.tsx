"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, Download, FileDown, FileJson, Printer } from "lucide-react";
import type { ExportSettings, Wordbook } from "@/lib/types";
import { ACCENTS, MARGIN_PRESETS, PAPERS, TONES } from "@/lib/paper";
import { sortSections } from "@/lib/sections";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Slider, SwitchRow } from "@/components/ui/field";
import { AccentPicker, SegmentedControl } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import { PrintDocument } from "@/components/export/PrintDocument";
import { MeasureLayer, useExportDocument } from "@/components/export/useExportDocument";
import { capturePagesAsPng, exportBaseName, exportRasterPdf, printPages, zipFiles, dpiLabel } from "@/lib/export/print";
import { cx, downloadBlob } from "@/lib/utils";

type ExportPatch = Parameters<ReturnType<typeof useAppStore.getState>["updateExportSettings"]>[1];

export function ExportStudio({ book }: { book: Wordbook }) {
  const update = useAppStore((s) => s.updateExportSettings);
  const reset = useAppStore((s) => s.resetExportSettings);
  const settings = book.exportSettings;
  const doc = useExportDocument(book, settings);
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);

  const patch = (p: ExportPatch) => update(book.id, p);
  const baseName = useMemo(() => exportBaseName(book.name, PAPERS.find((p) => p.id === settings.paper)?.name ?? ""), [book.name, settings.paper]);

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
      toast.info("已打开打印窗口", { description: "目标选择「另存为 PDF」；边距=None，缩放=100%，勾选「背景图形」" });
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

  const visibleSections = sortSections(book.schema.sections);

  return (
    <div className="flex h-dvh flex-col bg-background-100">
      {/* 顶部工具栏 */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-300 px-4">
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
          <Button size="md" onClick={onPrint}>
            <Printer className="size-4" /> 打印 / 矢量 PDF
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 设置面板 */}
        <aside className="w-[336px] shrink-0 overflow-y-auto border-r border-gray-300 px-4 py-4 scroll-thin">
          <Panel title="纸张与方向" defaultOpen>
            <Field label="纸张尺寸">
              <Select value={settings.paper} onChange={(e) => patch({ paper: e.target.value as ExportSettings["paper"] })}>
                {PAPERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.width}×{p.height}mm {p.note ? `（${p.note}）` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {settings.paper === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="宽 (mm)">
                  <Input
                    type="number"
                    value={settings.customPaper?.width ?? 200}
                    onChange={(e) => patch({ customPaper: { width: Number(e.target.value), height: settings.customPaper?.height ?? 260 } })}
                  />
                </Field>
                <Field label="高 (mm)">
                  <Input
                    type="number"
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
                className="w-full justify-stretch"
              />
            </Field>
            <Field label="纸张色调">
              <SegmentedControl
                value={settings.tone}
                onValueChange={(v) => patch({ tone: v })}
                options={(Object.keys(TONES) as (keyof typeof TONES)[]).map((id) => ({ value: id, label: TONES[id].name, title: TONES[id].hint }))}
                className="w-full"
              />
            </Field>
          </Panel>

          <Panel title="页边距与装订">
            <Field label="边距预设">
              <Select
                value=""
                onChange={(e) => {
                  const preset = MARGIN_PRESETS.find((p) => p.id === e.target.value);
                  if (preset) patch({ margin: preset.margin });
                }}
              >
                <option value="" disabled>
                  选择预设…
                </option>
                {MARGIN_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.hint}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-4 gap-2">
              {(["top", "right", "bottom", "left"] as const).map((k) => (
                <Field key={k} label={{ top: "上", right: "右", bottom: "下", left: "左" }[k]}>
                  <Input
                    type="number"
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
            <Field label="布局模式">
              <SegmentedControl
                value={settings.layout}
                onValueChange={(v) => patch({ layout: v })}
                options={[
                  { value: "flow", label: "流式分栏" },
                  { value: "grid", label: "网格闪卡" },
                ]}
                className="w-full"
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
                    className="w-full"
                  />
                </Field>
                <SliderRow label="栏间距" value={settings.columnGap} min={4} max={16} step={1} suffix="mm" onChange={(v) => patch({ columnGap: v })} />
                <SliderRow label="词条间距" value={settings.entryGap} min={0} max={16} step={0.5} suffix="mm" onChange={(v) => patch({ entryGap: v })} />
              </>
            ) : (
              <>
                <SliderRow label="网格列数" value={settings.grid.columns} min={1} max={4} step={1} onChange={(v) => patch({ grid: { columns: v } })} />
                <SliderRow label="网格行数" value={settings.grid.rows} min={2} max={10} step={1} onChange={(v) => patch({ grid: { rows: v } })} />
                <SwitchRow label="显示单元格边框" checked={settings.grid.showBorder} onCheckedChange={(v) => patch({ grid: { showBorder: v } })} />
                <SwitchRow
                  label="闪卡精简模式"
                  hint="只显示头部与首个字段"
                  checked={settings.grid.flashcard}
                  onCheckedChange={(v) => patch({ grid: { flashcard: v } })}
                />
              </>
            )}
          </Panel>

          <Panel title="卡片样式">
            <Field label="风格">
              <SegmentedControl
                value={settings.cardStyle}
                onValueChange={(v) => patch({ cardStyle: v })}
                options={[
                  { value: "classic", label: "经典" },
                  { value: "minimal", label: "极简" },
                  { value: "compact", label: "紧凑" },
                  { value: "notebook", label: "手账" },
                ]}
                className="w-full"
              />
            </Field>
            <Field label="字体">
              <SegmentedControl
                value={settings.fontFamily}
                onValueChange={(v) => patch({ fontFamily: v })}
                options={[
                  { value: "sans", label: "无衬线（Geist）" },
                  { value: "serif", label: "衬线（宋体）" },
                ]}
                className="w-full"
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
              <Select value={settings.headwordCase} onChange={(e) => patch({ headwordCase: e.target.value as ExportSettings["headwordCase"] })}>
                <option value="as-is">保持原样</option>
                <option value="lower">小写</option>
                <option value="upper">大写</option>
                <option value="title">首字母大写</option>
              </Select>
            </Field>
            <Field label="排序">
              <SegmentedControl
                value={settings.sortMode}
                onValueChange={(v) => patch({ sortMode: v })}
                options={[
                  { value: "list", label: "列表顺序" },
                  { value: "az", label: "字母序" },
                ]}
                className="w-full"
              />
            </Field>
          </Panel>

          <Panel title="主题强调色">
            <AccentPicker value={settings.accent} onChange={(v) => patch({ accent: v })} />
            <p className="t-label-12 mt-2 text-gray-700">当前：{ACCENTS[settings.accent].name}（{ACCENTS[settings.accent].hex}）</p>
          </Panel>

          <Panel title="封面">
            <SwitchRow label="启用封面" checked={settings.cover.enabled} onCheckedChange={(v) => patch({ cover: { enabled: v, title: settings.cover.title || book.name } })} />
            {settings.cover.enabled ? (
              <>
                <Field label="封面样式">
                  <Select value={settings.cover.style} onChange={(e) => patch({ cover: { style: e.target.value as ExportSettings["cover"]["style"] } })}>
                    <option value="minimal">极简居中</option>
                    <option value="band">色带横幅</option>
                    <option value="boxed">边框经典</option>
                    <option value="typewriter">打字机</option>
                  </Select>
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

          <Panel title="页脚">
            <SwitchRow label="显示页码" checked={settings.footer.pageNumbers} onCheckedChange={(v) => patch({ footer: { pageNumbers: v } })} />
            <Field label="页脚文字">
              <Input value={settings.footer.text} onChange={(e) => patch({ footer: { text: e.target.value } })} placeholder="如：WulonVocab · 我的单词本" />
            </Field>
            <SwitchRow label="页脚显示词库名" checked={settings.footer.bookName} onCheckedChange={(v) => patch({ footer: { bookName: v } })} />
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

          <div className="pb-6 pt-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                reset(book.id);
                toast.success("已恢复默认导出设置");
              }}
            >
              恢复默认设置
            </Button>
          </div>
        </aside>

        {/* 预览区 */}
        <main className="relative min-w-0 flex-1 overflow-auto bg-background-200 grid-bg">
          <div className="flex min-h-full items-start justify-center py-8">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
              {doc.ready ? (
                <div ref={rootRef}>
                  <PrintDocument book={book} doc={doc} />
                </div>
              ) : (
                <div className="flex h-96 w-[420px] items-center justify-center rounded-xl bg-background-100 shadow-geist-border">
                  <span className="t-label-13 text-gray-800">正在测量与分页…</span>
                </div>
              )}
            </div>
          </div>

          {/* 缩放控制 */}
          <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full bg-background-100 px-3 py-2 shadow-geist-menu">
            <span className="t-label-12 text-gray-800">缩放</span>
            <Slider
              className="w-40"
              min={0.3}
              max={1.5}
              step={0.05}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
            />
            <span className="t-mono-12 w-10 text-right text-gray-800">{Math.round(zoom * 100)}%</span>
          </div>

          {/* 进度遮罩 */}
          {progress ? (
            <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-xl bg-background-100 px-5 py-3 shadow-geist-modal">
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
        </main>
      </div>

      {/* 隐藏测量层 */}
      <MeasureLayer doc={doc} />
    </div>
  );
}

/* ---------------- 小部件 ---------------- */

function Panel({ title, desc, children, defaultOpen = false }: { title: string; desc?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-gray-300 py-3 first:pt-0 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="t-h-14">{title}</div>
          {desc ? <div className="t-label-12 text-gray-800">{desc}</div> : null}
        </div>
        <ChevronDown className={cx("size-4 text-gray-800 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
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
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
