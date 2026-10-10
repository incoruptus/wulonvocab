"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AccentId, SectionDef, SectionType, Wordbook } from "@/lib/types";
import { ACCENTS } from "@/lib/paper";
import { isValueEmpty, SECTION_ICON_CHOICES, SECTION_TYPE_LIST, SECTIONS, sortSections } from "@/lib/sections";
import { SCHEMA_PRESETS } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Input, Select, Switch, SwitchRow } from "@/components/ui/field";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import { SectionIcon } from "@/components/icon";
import { cx } from "@/lib/utils";

export function SchemaDesigner({ book }: { book: Wordbook }) {
  const addSection = useAppStore((s) => s.addSection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const sections = sortSections(book.schema.sections);
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sections.findIndex((s) => s.id === active.id);
    const to = sections.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    useAppStore.getState().moveSection(book.id, from, to);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 字段列表 */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-gray-300">
        <div className="flex items-center gap-2 border-b border-gray-300 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="flex-1">
                <Plus className="size-3.5" /> 添加字段
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-[60vh] w-64 overflow-y-auto scroll-thin">
              <DropdownMenuLabel>选择字段类型</DropdownMenuLabel>
              {SECTION_TYPE_LIST.map((t) => {
                const def = SECTIONS[t];
                return (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => {
                      const sec = addSection(book.id, { type: t as SectionType });
                      if (sec) setSelectedId(sec.id);
                    }}
                  >
                    <SectionIcon name={def.icon} className="size-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium">{def.label}</span>
                      <span className="block truncate text-[11px] text-gray-700">{def.hint}</span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" size="sm" onClick={() => setPresetOpen(true)}>
            <Layers className="size-3.5" /> 模板
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => (
                <SortableFieldRow
                  key={section.id}
                  section={section}
                  book={book}
                  active={section.id === selectedId}
                  onSelect={() => setSelectedId(section.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {sections.length === 0 ? (
            <EmptyState
              icon={<Plus className="size-4" />}
              title="字段表为空"
              desc="添加字段或应用模板开始设计你的词卡结构。"
              action={
                <Button size="sm" onClick={() => setPresetOpen(true)}>
                  应用模板
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      {/* 字段配置 */}
      <div className="min-w-0 flex-1 overflow-y-auto scroll-thin">
        {selected ? (
          <FieldConfig key={selected.id} book={book} section={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <EmptyState
            icon={<Layers className="size-4" />}
            title="选择一个字段进行配置"
            desc="可修改名称、图标、颜色、显示选项；拖动左侧列表调整顺序。"
          />
        )}
      </div>

      <PresetDialog book={book} open={presetOpen} onOpenChange={setPresetOpen} />
    </div>
  );
}

/* ---------------- 可拖拽字段行 ---------------- */

function SortableFieldRow({
  section,
  book,
  active,
  onSelect,
}: {
  section: SectionDef;
  book: Wordbook;
  active: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const def = SECTIONS[section.type];
  const filled = useMemo(
    () => book.entries.filter((e) => !isValueEmpty(section.type, e.values[section.key])).length,
    [book.entries, section],
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "group flex items-center gap-1.5 rounded-lg p-2 transition-colors",
        active ? "bg-blue-100/80" : "hover:bg-gray-100/80",
        isDragging && "z-10 opacity-90 shadow-geist-lg",
      )}
      onClick={onSelect}
    >
      <button
        type="button"
        aria-label="拖动排序"
        className="cursor-grab text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <SectionIcon name={section.icon} className="size-3.5 shrink-0 text-gray-900" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="t-label-14 truncate font-medium text-gray-1000">{section.label}</span>
          {!section.visible ? <span className="text-[10px] text-amber-900">隐藏</span> : null}
        </div>
        <div className="t-label-12 truncate text-gray-700">
          {def.label} · {section.key} · {filled}/{book.entries.length} 已填
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={section.visible}
          onCheckedChange={(v) => useAppStore.getState().updateSection(book.id, section.id, { visible: v })}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="字段操作" size="sm" className="size-6 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <span className="text-[14px] leading-none">⋯</span>
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => useAppStore.getState().duplicateSection(book.id, section.id)}>
            <Copy className="size-3.5" /> 复制字段
          </DropdownMenuItem>
          <DropdownMenuItem
            danger
            onSelect={() => {
              useAppStore.getState().removeSection(book.id, section.id);
              toast.success(`已删除字段「${section.label}」`, { description: "词条中的数据仍保留在「未定义字段」中，可随时提升回来。" });
            }}
          >
            <Trash2 className="size-3.5" /> 删除字段
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ---------------- 字段配置面板 ---------------- */

function FieldConfig({ book, section, onDeleted }: { book: Wordbook; section: SectionDef; onDeleted: () => void }) {
  const updateSection = useAppStore((s) => s.updateSection);
  const removeSection = useAppStore((s) => s.removeSection);
  const renameSectionKey = useAppStore((s) => s.renameSectionKey);
  const def = SECTIONS[section.type];
  const [label, setLabel] = useState(section.label);
  const [keyDraft, setKeyDraft] = useState(section.key);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const filled = book.entries.filter((e) => !isValueEmpty(section.type, e.values[section.key])).length;

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SectionIcon name={section.icon} className="size-4 text-gray-900" />
            <h2 className="t-h-16">{section.label}</h2>
            <Badge variant="blue" size="sm">
              {def.label}
            </Badge>
            {section.builtin ? (
              <Badge variant="gray" size="sm">
                模板内置
              </Badge>
            ) : null}
          </div>
          <p className="t-label-13 mt-1 text-gray-800">{def.hint}</p>
        </div>
        <Button variant="secondary" size="sm" className="text-red-900" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-3.5" /> 删除
        </Button>
      </div>

      <Card className="space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">显示名称</div>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() && label !== section.label) updateSection(book.id, section.id, { label: label.trim() });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">数据键 (key)</div>
            <Input
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={() => {
                const next = keyDraft.trim();
                if (!next || next === section.key) {
                  setKeyDraft(section.key);
                  return;
                }
                const ok = renameSectionKey(book.id, section.id, next);
                if (!ok) {
                  toast.error("键名冲突或无效，已还原");
                  setKeyDraft(section.key);
                } else {
                  toast.success(`数据键已重命名为 ${next}`, { description: "现有词条数据已同步迁移。" });
                }
              }}
              className="t-mono-13"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="t-label-13 font-medium text-gray-900">说明（展示在编辑器提示中）</div>
          <Input
            value={section.description ?? ""}
            onChange={(e) => updateSection(book.id, section.id, { description: e.target.value })}
            placeholder={def.hint}
          />
        </div>

        <div className="space-y-2">
          <div className="t-label-13 font-medium text-gray-900">图标</div>
          <div className="flex flex-wrap gap-1">
            {SECTION_ICON_CHOICES.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => updateSection(book.id, section.id, { icon: name })}
                className={cx(
                  "grid size-7 place-items-center rounded-md transition-colors",
                  section.icon === name ? "bg-gray-1000 text-background-100" : "bg-gray-100 text-gray-900 hover:bg-gray-200",
                )}
              >
                <SectionIcon name={name} className="size-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="t-label-13 font-medium text-gray-900">强调色</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button
                key={id}
                type="button"
                title={ACCENTS[id].name}
                onClick={() => updateSection(book.id, section.id, { color: section.color === id ? undefined : id })}
                className={cx(
                  "size-6 rounded-full transition-transform hover:scale-110",
                  section.color === id ? "ring-2 ring-gray-1000 ring-offset-2 ring-offset-background-100" : "shadow-geist-border",
                )}
                style={{ background: ACCENTS[id].hex }}
              />
            ))}
          </div>
          <p className="t-label-12 text-gray-700">字段级强调色会覆盖导出主题色（用于标签、标记等）。</p>
        </div>

        <SwitchRow
          label="在导出中显示"
          hint="也可在导出工作室中逐项覆盖"
          checked={section.visible}
          onCheckedChange={(v) => updateSection(book.id, section.id, { visible: v })}
        />
      </Card>

      {def.optionFields.length ? (
        <Card className="space-y-3">
          <div className="t-h-14">显示选项</div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-2">
            {def.optionFields.map((of) => {
              const raw = (section.options as Record<string, unknown>)[of.key];
              if (of.kind === "switch") {
                return (
                  <SwitchRow
                    key={of.key}
                    label={of.label}
                    checked={Boolean(raw ?? (def.defaults as Record<string, unknown>)[of.key])}
                    onCheckedChange={(v) => updateSection(book.id, section.id, { options: { [of.key]: v } })}
                  />
                );
              }
              if (of.kind === "select") {
                return (
                  <div key={of.key} className="space-y-1.5">
                    <div className="t-label-13 text-gray-900">{of.label}</div>
                    <Select
                      value={String(raw ?? (def.defaults as Record<string, unknown>)[of.key] ?? "")}
                      onChange={(e) => updateSection(book.id, section.id, { options: { [of.key]: e.target.value } })}
                    >
                      {(of.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              }
              return (
                <div key={of.key} className="space-y-1.5">
                  <div className="t-label-13 text-gray-900">{of.label}</div>
                  <Input
                    type={of.kind === "number" ? "number" : "text"}
                    value={String(raw ?? (def.defaults as Record<string, unknown>)[of.key] ?? "")}
                    onChange={(e) =>
                      updateSection(book.id, section.id, {
                        options: { [of.key]: of.kind === "number" ? Number(e.target.value) : e.target.value },
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="t-label-12 text-gray-700">
        已填写 {filled} / {book.entries.length} 个词条 · 类型 {section.type} · ID {section.id.slice(0, 8)}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader
          title="删除字段"
          desc={`「${section.label}」将从字段表移除${filled ? `；已有 ${filled} 个词条填写了该字段，数据不会丢失，会进入「未定义字段」区域` : ""}。`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={() => {
              removeSection(book.id, section.id);
              setDeleteOpen(false);
              onDeleted();
              toast.success("字段已删除");
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ---------------- 模板对话框 ---------------- */

function PresetDialog({ book, open, onOpenChange }: { book: Wordbook; open: boolean; onOpenChange: (v: boolean) => void }) {
  const applyPreset = useAppStore((s) => s.applyPreset);
  const [presetId, setPresetId] = useState(SCHEMA_PRESETS[0].id);
  const preset = SCHEMA_PRESETS.find((p) => p.id === presetId)!;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-2xl">
      <DialogHeader title="字段模板" desc="应用预设结构。替换会移除现有字段（数据保留）；合并只补充缺失字段。" />
      <DialogBody className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SCHEMA_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              className={cx(
                "rounded-xl p-3 text-left transition-colors",
                presetId === p.id ? "bg-blue-100 shadow-geist-border" : "bg-background-200 hover:bg-gray-100",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="t-h-14">{p.name}</span>
                {p.id === presetId ? <Badge variant="blue" size="sm">已选</Badge> : null}
              </div>
              <p className="t-label-12 mt-1 text-gray-800">{p.description}</p>
              <div className="t-label-12 mt-2 flex flex-wrap gap-1">
                {p.build().sections.slice(0, 6).map((s) => (
                  <span key={s.key} className="rounded bg-background-100 px-1.5 py-0.5 text-gray-900">
                    {s.label}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
        <FieldSummary presetId={presetId} />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            applyPreset(book.id, presetId, "merge");
            onOpenChange(false);
            toast.success(`已合并模板「${preset.name}」（保留现有字段）`);
          }}
        >
          合并（保留现有）
        </Button>
        <Button
          onClick={() => {
            applyPreset(book.id, presetId, "replace");
            onOpenChange(false);
            toast.success(`已应用模板「${preset.name}」`, { description: "词条数据保持不变，可随时切回。" });
          }}
        >
          替换结构
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function FieldSummary({ presetId }: { presetId: string }) {
  const preset = SCHEMA_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  const schema = preset.build();
  return (
    <div className="rounded-lg bg-background-200 p-3">
      <div className="t-label-12 mb-1.5 text-gray-800">该模板包含 {schema.sections.length} 个字段：</div>
      <div className="flex flex-wrap gap-1.5">
        {schema.sections.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 rounded-full bg-background-100 px-2 py-0.5 text-[12px] shadow-geist-border">
            <SectionIcon name={s.icon} className="size-3" /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
