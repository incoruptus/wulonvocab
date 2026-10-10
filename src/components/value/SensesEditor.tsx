"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import type { SectionDef, SenseItem } from "@/lib/types";
import { COMMON_POS, normalizePos } from "@/lib/sections";
import { blankSense } from "@/lib/presets";
import { Textarea } from "@/components/ui/field";
import { Button, IconButton } from "@/components/ui/button";
import { Tip } from "@/components/ui/overlay";
import { ExamplesEditor, ListEditor, WordListEditor } from "./ValueEditor";
import { cx } from "@/lib/utils";

/**
 * 义项编辑器：词性 → 释义 → 用法 / 句型 / 例句 / 近反义词 / 搭配 / 备注。
 * 单个义项可折叠；支持排序、复制、删除。
 */
export function SensesEditor({
  senses,
  onChange,
  section,
}: {
  senses: SenseItem[];
  onChange: (v: SenseItem[]) => void;
  section: SectionDef;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const o = section.options;

  const update = (id: string, patch: Partial<SenseItem>) => {
    onChange(senses.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= senses.length) return;
    const next = [...senses];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addSense = () => {
    const lastPos = senses.length ? senses[senses.length - 1].pos : "";
    const s = blankSense(lastPos);
    onChange([...senses, s]);
  };

  return (
    <div className="space-y-2">
      {senses.map((sense, i) => {
        const isCollapsed = collapsed.has(sense.id);
        return (
          <div key={sense.id} className="rounded-lg bg-background-200 shadow-geist-border">
            <div className="flex items-center gap-1 border-b border-gray-300/70 px-2 py-1.5">
              <button
                type="button"
                onClick={() => toggle(sense.id)}
                className="grid size-6 shrink-0 place-items-center rounded-md text-gray-800 hover:bg-gray-100 hover:text-gray-1000"
                aria-label={isCollapsed ? "展开" : "折叠"}
              >
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
              <span className="t-label-12 w-4 shrink-0 text-gray-700">{i + 1}</span>
              <PosInput value={sense.pos} onChange={(pos) => update(sense.id, { pos })} />
              {isCollapsed ? (
                <span className="t-label-13 min-w-0 flex-1 truncate text-gray-800">
                  {sense.translation || sense.definition || "（未填写释义）"}
                </span>
              ) : (
                <span className="flex-1" />
              )}
              <div className="flex shrink-0 items-center">
                <Tip tip="上移">
                  <IconButton label="上移" size="sm" className="size-6" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </IconButton>
                </Tip>
                <Tip tip="下移">
                  <IconButton label="下移" size="sm" className="size-6" disabled={i === senses.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </IconButton>
                </Tip>
                <Tip tip="复制义项">
                  <IconButton
                    label="复制"
                    size="sm"
                    className="size-6"
                    onClick={() => {
                      const copy: SenseItem = { ...sense, id: crypto.randomUUID(), examples: sense.examples.map((e) => ({ ...e })), patterns: [...sense.patterns], synonyms: [...sense.synonyms], antonyms: [...sense.antonyms], collocations: [...sense.collocations] };
                      const next = [...senses];
                      next.splice(i + 1, 0, copy);
                      onChange(next);
                    }}
                  >
                    <Copy className="size-3" />
                  </IconButton>
                </Tip>
                <Tip tip="删除义项">
                  <IconButton
                    label="删除"
                    size="sm"
                    className="size-6 text-gray-800 hover:text-red-900"
                    onClick={() => onChange(senses.filter((s) => s.id !== sense.id))}
                  >
                    <Trash2 className="size-3" />
                  </IconButton>
                </Tip>
              </div>
            </div>

            {!isCollapsed ? (
              <div className="space-y-3 p-3">
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  <Labelled label="中文释义">
                    <Textarea rows={3} value={sense.translation} onChange={(e) => update(sense.id, { translation: e.target.value })} placeholder="抛弃；遗弃（支持 Markdown）" className="text-[13px]" />
                  </Labelled>
                  <Labelled label="英文释义">
                    <Textarea rows={3} value={sense.definition} onChange={(e) => update(sense.id, { definition: e.target.value })} placeholder="to leave sb/sth…" className="text-[13px]" />
                  </Labelled>
                </div>

                {o.showUsage !== false ? (
                  <Labelled label="用法说明">
                    <Textarea rows={2} value={sense.usage} onChange={(e) => update(sense.id, { usage: e.target.value })} placeholder="常用被动语态；考试高频用法…" className="text-[13px]" />
                  </Labelled>
                ) : null}

                {o.showPatterns !== false ? (
                  <Labelled label="句型结构">
                    <ListEditor items={sense.patterns} onChange={(v) => update(sense.id, { patterns: v })} placeholder="abandon sb/sth" />
                  </Labelled>
                ) : null}

                {o.showExamples !== false ? (
                  <Labelled label="例句">
                    <ExamplesEditor items={sense.examples} onChange={(v) => update(sense.id, { examples: v })} />
                  </Labelled>
                ) : null}

                {o.showCollocations !== false ? (
                  <Labelled label="固定搭配">
                    <WordListEditor items={sense.collocations} onChange={(v) => update(sense.id, { collocations: v })} placeholder="abandon hope 放弃希望" />
                  </Labelled>
                ) : null}

                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {o.showSynonyms !== false ? (
                    <Labelled label="近义词">
                      <WordListEditor items={sense.synonyms} onChange={(v) => update(sense.id, { synonyms: v })} />
                    </Labelled>
                  ) : null}
                  {o.showAntonyms ? (
                    <Labelled label="反义词">
                      <WordListEditor items={sense.antonyms} onChange={(v) => update(sense.id, { antonyms: v })} />
                    </Labelled>
                  ) : null}
                </div>

                {o.showNotes !== false ? (
                  <Labelled label="备注 / 辨析">
                    <Textarea rows={2} value={sense.notes} onChange={(e) => update(sense.id, { notes: e.target.value })} placeholder="易错点、近义辨析、记忆提示…" className="text-[13px]" />
                  </Labelled>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <Button variant="tertiary" size="sm" onClick={addSense}>
        <Plus className="size-3.5" /> 添加义项
      </Button>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="t-label-12 text-gray-800">{label}</div>
      {children}
    </div>
  );
}

function PosInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      list="wv-pos-list"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const norm = normalizePos(e.target.value);
        if (norm !== e.target.value) onChange(norm);
      }}
      placeholder="词性"
      className={cx(
        "h-6 w-16 shrink-0 rounded-md bg-background-100 px-1.5 text-center text-[12px] font-medium text-gray-1000 shadow-geist-border",
        "outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_3px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
      )}
    />
  );
}

/** 全局共享的词性候选列表 */
export function PosDatalist() {
  return (
    <datalist id="wv-pos-list">
      {COMMON_POS.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}
