"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Eye, EyeOff } from "lucide-react";
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
import { COMMON_POS } from "@/lib/sections";
import { Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button, IconButton } from "@/components/ui/button";
import { Tip } from "@/components/ui/overlay";
import { MarkdownLite } from "@/components/MarkdownLite";
import { SensesEditor } from "./SensesEditor";
import { cx } from "@/lib/utils";

export interface ValueEditorProps {
  section: SectionDef;
  value: unknown;
  onChange: (v: unknown) => void;
}

export function ValueEditor({ section, value, onChange }: ValueEditorProps) {
  switch (section.type) {
    case "text":
      return (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={section.options.prefix ? `${section.options.prefix} …` : "输入内容…"}
        />
      );
    case "quote":
    case "markdown":
      return <MarkdownEditor value={String(value ?? "")} onChange={onChange} rows={section.type === "markdown" ? 5 : 3} />;
    case "list":
      return <ListEditor items={(value as string[]) ?? []} onChange={onChange} placeholder="添加一条…" />;
    case "tags":
      return <TagsEditor items={(value as string[]) ?? []} onChange={onChange} />;
    case "pronunciation":
      return <PronunciationEditor value={(value as PronunciationValue) ?? {}} onChange={onChange} section={section} />;
    case "senses":
      return <SensesEditor senses={(value as SenseItem[]) ?? []} onChange={onChange} section={section} />;
    case "examples":
      return <ExamplesEditor items={(value as ExampleItem[]) ?? []} onChange={onChange} />;
    case "keyvalue":
      return (
        <KeyValueEditor
          items={(value as KeyValueItem[]) ?? []}
          onChange={onChange}
          keyLabel={section.options.keyLabel ?? "键"}
          valueLabel={section.options.valueLabel ?? "值"}
        />
      );
    case "transforms":
      return <TransformsEditor items={(value as TransformItem[]) ?? []} onChange={onChange} />;
    case "table":
      return <TableEditor value={(value as TableValue) ?? { columns: [], rows: [] }} onChange={onChange} />;
    case "image":
      return <ImagesEditor items={(value as ImageValue[]) ?? []} onChange={onChange} />;
    case "rating": {
      const r = (value as RatingValue) ?? { value: 0, max: section.options.max ?? 5 };
      const max = section.options.max ?? r.max ?? 5;
      return (
        <div className="flex items-center gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1} 分`}
              onClick={() => onChange({ ...r, value: i + 1 === r.value ? 0 : i + 1, max })}
              className={cx(
                "grid size-7 place-items-center rounded-md text-[15px] transition-colors",
                i < r.value ? "bg-amber-700/20 text-amber-900" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              ★
            </button>
          ))}
          <span className="t-label-12 text-gray-800">
            {r.value} / {max}
          </span>
        </div>
      );
    }
    case "divider":
      return <p className="t-label-12 text-gray-800">分隔线无需内容，导出时会画成一条装饰线。</p>;
    default:
      return null;
  }
}

/* ---------------- Markdown 编辑器（带预览） ---------------- */

export function MarkdownEditor({
  value,
  onChange,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-1.5">
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder="支持 **加粗**、*斜体*、`代码`、==高亮==、- 列表" />
      <div className="flex items-center justify-between">
        <Tip tip={preview ? "隐藏预览" : "预览渲染效果"}>
          <IconButton label="切换预览" size="sm" onClick={() => setPreview((v) => !v)}>
            {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconButton>
        </Tip>
        <span className="t-label-12 text-gray-700">Markdown</span>
      </div>
      {preview ? (
        <div className="rounded-md bg-background-200 p-2.5 text-[13px] shadow-geist-border">
          <MarkdownLite text={value || "*（空）*"} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 通用列表编辑器 ---------------- */

export function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const update = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={item} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} className="h-8 text-[13px]" />
          <ItemTools
            up={i > 0}
            down={i < items.length - 1}
            onMove={(d) => move(i, d)}
            onRemove={() => onChange(items.filter((_, k) => k !== i))}
          />
        </div>
      ))}
      <Button variant="tertiary" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="size-3.5" /> 添加
      </Button>
    </div>
  );
}

function ItemTools({
  up,
  down,
  onMove,
  onRemove,
}: {
  up: boolean;
  down: boolean;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton label="上移" size="xs" disabled={!up} onClick={() => onMove(-1)}>
        <ArrowUp className="size-3.5" />
      </IconButton>
      <IconButton label="下移" size="xs" disabled={!down} onClick={() => onMove(1)}>
        <ArrowDown className="size-3.5" />
      </IconButton>
      <IconButton label="删除" size="xs" onClick={onRemove} className="text-gray-800 hover:text-red-900">
        <Trash2 className="size-3.5" />
      </IconButton>
    </div>
  );
}

/* ---------------- 标签编辑器 ---------------- */

export function TagsEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md bg-background-100 p-1.5 shadow-geist-border">
      {items.map((item, i) => (
        <span key={i} className="inline-flex h-6 items-center gap-1 rounded-full bg-gray-100 px-2.5 text-[12px] text-gray-1000">
          {item}
          <button
            type="button"
            aria-label={`移除 ${item}`}
            className="-mr-1 grid size-4 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === "，" || e.key === "、") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && items.length) {
            onChange(items.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={items.length ? "" : (placeholder ?? "输入后回车…")}
        className="min-w-24 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-gray-700"
      />
    </div>
  );
}

/* ---------------- 近义词等「词表」编辑器（本地态 + 失焦提交） ---------------- */

export function WordListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const commit = (value: string) =>
    onChange(
      value
        .split(/[,，;；、/|]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  return (
    <Input
      key={items.join("\u0001")}
      defaultValue={items.join("、")}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder ?? "用「、」或逗号分隔"}
      className="h-8 text-[13px]"
    />
  );
}

/* ---------------- 音标编辑器 ---------------- */

function PronunciationEditor({
  value,
  onChange,
  section,
}: {
  value: PronunciationValue;
  onChange: (v: PronunciationValue) => void;
  section: SectionDef;
}) {
  const set = (k: keyof PronunciationValue, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="t-label-13 w-6 shrink-0 text-gray-800">英</span>
        <Input value={value.uk ?? ""} onChange={(e) => set("uk", e.target.value)} placeholder="/əˈbændən/" className="h-8 font-mono text-[13px]" />
        <span className="t-label-13 w-6 shrink-0 text-gray-800">美</span>
        <Input value={value.us ?? ""} onChange={(e) => set("us", e.target.value)} placeholder="/əˈbændən/" className="h-8 font-mono text-[13px]" />
      </div>
      {section.options.showAudio ? (
        <div className="flex items-center gap-2">
          <span className="t-label-13 w-6 shrink-0 text-gray-800">音</span>
          <Input value={value.audioUk ?? ""} onChange={(e) => set("audioUk", e.target.value)} placeholder="英音音频 URL" className="h-8 text-[12px]" />
          <Input value={value.audioUs ?? ""} onChange={(e) => set("audioUs", e.target.value)} placeholder="美音音频 URL" className="h-8 text-[12px]" />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 例句编辑器 ---------------- */

export function ExamplesEditor({ items, onChange }: { items: ExampleItem[]; onChange: (v: ExampleItem[]) => void }) {
  const update = (i: number, patch: Partial<ExampleItem>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((ex, i) => (
        <div key={i} className="rounded-lg bg-background-200 p-2 shadow-geist-border">
          <div className="flex items-start gap-1.5">
            <span className="t-label-12 mt-2 w-4 shrink-0 text-gray-700">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Textarea rows={2} value={ex.en} onChange={(e) => update(i, { en: e.target.value })} placeholder="English sentence…" className="text-[13px]" />
              <Input value={ex.zh ?? ""} onChange={(e) => update(i, { zh: e.target.value })} placeholder="中文翻译（可选）" className="h-8 text-[13px]" />
              <Input value={ex.source ?? ""} onChange={(e) => update(i, { source: e.target.value })} placeholder="出处（如 考研真题2019 / OALD，可选）" className="h-8 text-[12px]" />
            </div>
            <ItemTools up={i > 0} down={i < items.length - 1} onMove={(d) => move(i, d)} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
          </div>
        </div>
      ))}
      <Button variant="tertiary" size="sm" onClick={() => onChange([...items, { en: "" }])}>
        <Plus className="size-3.5" /> 添加例句
      </Button>
    </div>
  );
}

/* ---------------- 键值对编辑器 ---------------- */

export function KeyValueEditor({
  items,
  onChange,
  keyLabel,
  valueLabel,
}: {
  items: KeyValueItem[];
  onChange: (v: KeyValueItem[]) => void;
  keyLabel: string;
  valueLabel: string;
}) {
  const update = (i: number, patch: Partial<KeyValueItem>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={it.key} onChange={(e) => update(i, { key: e.target.value })} placeholder={keyLabel} className="h-8 w-40 text-[13px] font-medium" />
          <Input value={it.value} onChange={(e) => update(i, { value: e.target.value })} placeholder={valueLabel} className="h-8 flex-1 text-[13px]" />
          <ItemTools up={i > 0} down={i < items.length - 1} onMove={(d) => move(i, d)} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <Button variant="tertiary" size="sm" onClick={() => onChange([...items, { key: "", value: "" }])}>
        <Plus className="size-3.5" /> 添加一组
      </Button>
    </div>
  );
}

/* ---------------- 词性变换编辑器 ---------------- */

export function TransformsEditor({ items, onChange }: { items: TransformItem[]; onChange: (v: TransformItem[]) => void }) {
  const update = (i: number, patch: Partial<TransformItem>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={t.form} onChange={(e) => update(i, { form: e.target.value })} placeholder="形式，如 abandoned" className="h-8 flex-1 text-[13px]" />
          <Select
            size="sm"
            className="w-24 shrink-0"
            value={t.pos ?? ""}
            onValueChange={(v) => update(i, { pos: v })}
            options={[
              { value: "", label: "（无）" },
              ...COMMON_POS.map((p) => ({ value: p, label: p })),
              { value: "_custom", label: "自定义…" },
              ...(t.pos && !(COMMON_POS as readonly string[]).includes(t.pos) && t.pos !== "_custom"
                ? [{ value: t.pos, label: t.pos }]
                : []),
            ]}
          />
          <Input value={t.note ?? ""} onChange={(e) => update(i, { note: e.target.value })} placeholder="说明，如 过去式" className="h-8 w-32 text-[12px]" />
          <ItemTools up={i > 0} down={i < items.length - 1} onMove={(d) => move(i, d)} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <Button variant="tertiary" size="sm" onClick={() => onChange([...items, { form: "" }])}>
        <Plus className="size-3.5" /> 添加形式
      </Button>
    </div>
  );
}

/* ---------------- 表格编辑器 ---------------- */

function TableEditor({ value, onChange }: { value: TableValue; onChange: (v: TableValue) => void }) {
  const columns = value.columns.length ? value.columns : ["列 1", "列 2"];
  const rows = value.rows;
  const setCol = (i: number, v: string) => {
    const next = [...columns];
    next[i] = v;
    onChange({ columns: next, rows });
  };
  const setCell = (ri: number, ci: number, v: string) => {
    const next = rows.map((r) => [...r]);
    next[ri][ci] = v;
    onChange({ columns, rows: next });
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="border border-gray-300 p-1">
                  <div className="flex items-center gap-1">
                    <Input value={c} onChange={(e) => setCol(i, e.target.value)} className="h-7 text-[12px] font-medium" />
                    {columns.length > 1 ? (
                      <IconButton
                        label="删除列"
                        size="xs" className="text-gray-800 hover:text-red-900"
                        onClick={() =>
                          onChange({
                            columns: columns.filter((_, k) => k !== i),
                            rows: rows.map((r) => r.filter((_, k) => k !== i)),
                          })
                        }
                      >
                        <Trash2 className="size-3" />
                      </IconButton>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td key={ci} className="border border-gray-300 p-1">
                    <Input value={row[ci] ?? ""} onChange={(e) => setCell(ri, ci, e.target.value)} className="h-7 text-[12px]" />
                  </td>
                ))}
                <td className="w-7 border-0 p-1">
                  <IconButton
                    label="删除行"
                    size="xs" className="text-gray-800 hover:text-red-900"
                    onClick={() => onChange({ columns, rows: rows.filter((_, k) => k !== ri) })}
                  >
                    <Trash2 className="size-3" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="tertiary" size="sm" onClick={() => onChange({ columns, rows: [...rows, columns.map(() => "")] })}>
          <Plus className="size-3.5" /> 添加行
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => onChange({ columns: [...columns, `列 ${columns.length + 1}`], rows: rows.map((r) => [...r, ""]) })}>
          <Plus className="size-3.5" /> 添加列
        </Button>
      </div>
    </div>
  );
}

/* ---------------- 图片编辑器 ---------------- */

function ImagesEditor({ items, onChange }: { items: ImageValue[]; onChange: (v: ImageValue[]) => void }) {
  const update = (i: number, patch: Partial<ImageValue>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((img, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-background-200 p-2 shadow-geist-border">
          {img.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt="" className="h-14 w-14 rounded-md bg-gray-100 object-contain" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-md bg-gray-100 text-gray-700">
              <GripVertical className="size-4" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input value={img.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="图片 URL 或本地相对路径" className="h-8 text-[12px]" />
            <Input value={img.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder="图注（可选）" className="h-8 text-[12px]" />
          </div>
          <IconButton
            label="删除"
            size="xs" className="text-gray-800 hover:text-red-900"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ))}
      <Button variant="tertiary" size="sm" onClick={() => onChange([...items, { url: "" }])}>
        <Plus className="size-3.5" /> 添加图片
      </Button>
    </div>
  );
}
