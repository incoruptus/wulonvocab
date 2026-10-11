"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileJson, FileSpreadsheet, UploadCloud } from "lucide-react";
import type { Wordbook } from "@/lib/types";
import { buildImportResult, parseImportText, type ParsedImport } from "@/lib/importer";
import { defaultExportSettings } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Badge, Card, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { assetPath } from "@/lib/paths";
import { requestSyncSoon } from "@/lib/sync/auto";
import { cx, uid } from "@/lib/utils";

type Target = "new" | "append" | "replace";

export function ImportDialog({
  open,
  onOpenChange,
  targetBook,
  onImported,
  seed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetBook?: Wordbook | null;
  onImported: (bookId: string) => void;
  /** 外部预置内容（文档/图片抽取结果）：打开时直接进入解析预览 */
  seed?: { name: string; text: string } | null;
}) {
  const replaceBook = useAppStore((s) => s.replaceBook);
  const appendEntries = useAppStore((s) => s.appendEntries);
  const replaceEntries = useAppStore((s) => s.replaceEntries);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<Target>(targetBook ? "append" : "new");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setFilename("");
    setParsed(null);
    setError(null);
    setName("");
    setTarget(targetBook ? "append" : "new");
    lastSeedRef.current = null;
  };

  const parse = useCallback((content: string, file: string) => {
    try {
      const p = parseImportText(content, file);
      if (p.kind === "unknown" || !p.rows.length) {
        setError(p.warnings.join("；") || "无法识别文件结构");
        setParsed(null);
        return;
      }
      setParsed(p);
      setError(null);
      setName((prev) => prev || p.wordbookMeta?.name || file.replace(/\.[^.]+$/, "") || "导入词库");
    } catch (e) {
      setError((e as Error).message);
      setParsed(null);
    }
  }, []);

  // 种子模式：外部抽取好的文本（docx / pdf / 视觉转写）直接进入解析预览
  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !seed) return;
    const sig = `${seed.name}::${seed.text.length}`;
    if (lastSeedRef.current === sig) return;
    lastSeedRef.current = sig;
    setFilename(seed.name);
    setText(seed.text.slice(0, 5_000_000));
    parse(seed.text, seed.name);
  }, [open, seed, parse]);

  const readFile = async (file: File) => {
    setFilename(file.name);
    const content = await file.text();
    setText(content.slice(0, 5_000_000));
    parse(content, file.name);
  };

  const schemaOrigin = useMemo(() => {
    if (!parsed) return null;
    if (parsed.schema && parsed.schema.sections.length) return "doc" as const;
    if (targetBook && target !== "new") return "current" as const;
    return "inferred" as const;
  }, [parsed, targetBook, target]);

  const doImport = () => {
    if (!parsed) return;
    const result = buildImportResult(parsed, {
      name: name.trim() || undefined,
      baseBook: target !== "new" && targetBook ? targetBook : undefined,
    });
    if (!result.entries.length) {
      toast.error("没有可导入的词条");
      return;
    }
    if (target === "new" || !targetBook) {
      const book: Wordbook = {
        id: uid(),
        name: result.name,
        description: result.description ?? "",
        tags: result.tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schema: result.schema,
        entries: result.entries,
        exportSettings: defaultExportSettings(result.name),
        meta: result.meta,
      };
      replaceBook(book);
      toast.success(`已导入 ${result.entries.length} 个词条`, {
        description: `字段结构：${schemaOrigin === "doc" ? "文件自带" : schemaOrigin === "current" ? "当前词库" : "自动识别"}${result.warnings.length ? ` · ${result.warnings.length} 条提醒` : ""}`,
      });
      onImported(book.id);
    } else if (target === "append") {
      appendEntries(targetBook.id, result.entries);
      toast.success(`已追加 ${result.entries.length} 个词条`, { description: "重复单词已自动合并" });
      onImported(targetBook.id);
    } else {
      replaceEntries(targetBook.id, result.entries);
      toast.success(`已替换为 ${result.entries.length} 个词条`);
      onImported(targetBook.id);
    }
    onOpenChange(false);
    reset();
    requestSyncSoon(); // 批量导入后 30s 推送（自动同步开启时才发生）
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      widthClass="max-w-2xl"
    >
      <DialogHeader
        title="导入 JSON / CSV"
        desc="WulonVocab 文档、词条数组、词典对象、CSV / NDJSON 都能进；结构自动识别，先导进来再说。"
      />
      <DialogBody className="space-y-4">
        {!parsed ? (
          <>
            <div className="flex items-center justify-between">
              <SegmentedControl
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: "file", label: "选择文件" },
                  { value: "paste", label: "粘贴文本" },
                ]}
              />
              <a href={assetPath("/samples/sample-import.json")} download className="t-label-12 text-blue-900 underline decoration-dotted">
                下载示例 JSON
              </a>
            </div>

            {mode === "file" ? (
              <button
                type="button"
                aria-label="选择文件（也可把文件拖到这里）"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) await readFile(file);
                }}
                onClick={() => fileRef.current?.click()}
                className={cx(
                  "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging ? "border-blue-700 bg-blue-100/40" : "border-gray-400 hover:border-gray-600 hover:bg-gray-100/60",
                )}
              >
                <UploadCloud className="size-7 text-gray-800" />
                <div className="t-h-14">拖入文件，或点击选择</div>
                <div className="t-label-12 text-gray-700">
                  支持 .json / .csv / .tsv / .txt（NDJSON）：例如 AI 整理出的词表、ECDICT 词库、OALD 等词典导出的数据
                </div>
                <div className="t-label-12 flex items-center gap-3 pt-1 text-gray-700">
                  <span className="inline-flex items-center gap-1">
                    <FileJson className="size-3.5" /> JSON
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileSpreadsheet className="size-3.5" /> CSV / TSV
                  </span>
                </div>
              </button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='粘贴 JSON 数组，或 {"wordbook": ..., "entries": [...]} 文档…'
                  className="t-mono-13"
                />
                <Button variant="secondary" size="sm" onClick={() => parse(text, "pasted.json")} disabled={!text.trim()}>
                  解析内容
                </Button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await readFile(file);
                e.target.value = "";
              }}
            />
          </>
        ) : (
          <div className="space-y-4">
            <Card className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="green" size="sm">
                  解析成功
                </Badge>
                <Badge variant="gray" size="sm">
                  {
                    {
                      wulonvocab: "WulonVocab 完整文档",
                      rows: "词条数组",
                      map: "词典对象",
                      ecdict: "词典数据（ECDICT 结构）",
                      unknown: "未知",
                    }[parsed.kind]
                  }
                </Badge>
                <span className="t-label-13 text-gray-900">{parsed.rows.length} 条记录</span>
                {filename ? <span className="t-label-12 text-gray-700">· {filename}</span> : null}
              </div>
              {parsed.headers.length ? (
                <div className="flex flex-wrap gap-1">
                  {parsed.headers.slice(0, 14).map((h) => (
                    <span key={h} className="rounded bg-background-100 px-1.5 py-0.5 text-[11px] text-gray-900 shadow-geist-border">
                      {h}
                    </span>
                  ))}
                  {parsed.headers.length > 14 ? <span className="text-[11px] text-gray-700">…共 {parsed.headers.length} 列</span> : null}
                </div>
              ) : null}
              <div className="t-label-12 text-gray-800">
                字段结构：
                {schemaOrigin === "doc"
                  ? "用文件自带的字段表"
                  : schemaOrigin === "current"
                    ? "使用当前词库的字段表（未定义字段自动保留）"
                    : "根据数据自动识别字段类型，导入即可排版"}
              </div>
              {parsed.warnings.length ? (
                <div className="rounded-lg bg-amber-700/10 p-2 text-[12px] text-amber-900">
                  {parsed.warnings.map((w, i) => (
                    <div key={i}>· {w}</div>
                  ))}
                </div>
              ) : null}
            </Card>

            <div className="space-y-3">
              <div className="t-label-13 font-medium text-gray-900">导入方式</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "new", label: "新建词库", desc: "创建一个新词库" },
                    ...(targetBook
                      ? ([
                          { value: "append", label: `追加到「${targetBook.name}」`, desc: "合并重复单词" },
                          { value: "replace", label: "替换当前词库词条", desc: "清空后写入" },
                        ] as const)
                      : []),
                  ] as { value: Target; label: string; desc: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTarget(opt.value)}
                    className={cx(
                      "rounded-lg px-3 py-2 text-left transition-colors",
                      target === opt.value ? "bg-blue-100 shadow-geist-border" : "bg-background-200 hover:bg-gray-100",
                    )}
                  >
                    <div className="t-label-13 font-medium text-gray-1000">{opt.label}</div>
                    <div className="t-label-12 text-gray-800">{opt.desc}</div>
                  </button>
                ))}
              </div>
              {target === "new" ? (
                <div className="space-y-1.5">
                  <div className="t-label-13 font-medium text-gray-900">词库名称</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：考研词汇 · Unit 1" />
                </div>
              ) : null}
            </div>

            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setParsed(null);
                setError(null);
              }}
            >
              重新选择文件
            </Button>
          </div>
        )}

        {error ? (
          <div className="rounded-lg bg-red-700/10 p-3 text-[13px] text-red-900">{error}</div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={doImport} disabled={!parsed} loading={false}>
          开始导入
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
