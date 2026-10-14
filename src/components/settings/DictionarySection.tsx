"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Database, DownloadCloud, HardDrive, Trash2, Upload } from "lucide-react";
import { buildLocalDictRows, deleteLocalDictionaryData, dropDictionaryCache, makeDictionaryMeta, saveLocalDictionary } from "@/lib/lookup/localdict";
import { BUILTIN_DICTS, downloadBuiltinDict, type BuiltinDict } from "@/lib/lookup/builtinDicts";
import { parseImportText } from "@/lib/importer";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/misc";

const now = () => Date.now();

/** 本地词库：内置离线词典一键包 + 自行导入数据集 + 已就绪列表 */
export function DictionarySection() {
  const dictionaries = useAppStore((s) => s.dictionaries);
  const addDictionary = useAppStore((s) => s.addDictionary);
  const removeDictionary = useAppStore((s) => s.removeDictionary);
  const [dictBusy, setDictBusy] = useState(false);
  const [builtinBusy, setBuiltinBusy] = useState<string | null>(null);
  const [builtinProgress, setBuiltinProgress] = useState(0);
  const dictFileRef = useRef<HTMLInputElement>(null);

  const importDictionary = async (file: File) => {
    setDictBusy(true);
    const t = toast.loading(`正在解析本地词库「${file.name}」…`);
    try {
      const text = await file.text();
      const parsed = parseImportText(text, file.name);
      const rows = buildLocalDictRows(parsed);
      if (!rows.length) throw new Error("未解析出有效词条");
      const meta = makeDictionaryMeta(file.name.replace(/\.[^.]+$/, ""), file.name, rows.length, `${parsed.kind} 结构`);
      await saveLocalDictionary(meta, rows);
      addDictionary(meta);
      toast.success(`本地词库导入完成：${rows.length} 条`, { id: t });
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`, { id: t });
    } finally {
      setDictBusy(false);
    }
  };

  /** 一键内置词典：下载（可进度）→ 解压 → 解析 → 写库 → 自动启用本地词库源 */
  const importBuiltin = async (dict: BuiltinDict) => {
    setBuiltinBusy(dict.id);
    setBuiltinProgress(0);
    const t = toast.loading(`正在下载「${dict.name}」…`);
    try {
      const text = await downloadBuiltinDict(dict, (r) => setBuiltinProgress(r));
      toast.loading("正在解析与写入…", { id: t });
      const parsed = parseImportText(text, `${dict.id}.csv`);
      const rows = buildLocalDictRows(parsed);
      if (!rows.length) throw new Error("未解析出有效词条");
      const meta = {
        id: `builtin-${dict.id}`,
        name: dict.name,
        source: "内置 · ECDICT (MIT)",
        count: rows.length,
        importedAt: now(),
        note: `${parsed.kind} 结构 · 离线`,
      };
      await saveLocalDictionary(meta, rows);
      dropDictionaryCache(meta.id); // 重导后清掉内存旧表，避免本会话继续命中旧数据
      addDictionary(meta);
      const state = useAppStore.getState();
      const localSrc = state.lookupSources.find((s) => s.kind === "localdict");
      if (localSrc && !localSrc.enabled) state.updateLookupSource(localSrc.id, { enabled: true });
      toast.success(`「${dict.name}」已就绪：${rows.length} 词 · 离线查词 <10ms`, { id: t });
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`, { id: t });
    } finally {
      setBuiltinBusy(null);
    }
  };

  return (
    <Card className="space-y-4">
      <CardTitle
        desc="先一键内置离线词典（ECDICT 精要 / 标准），或导入 OALD / ECDICT 等数据集（JSON / CSV）。内置包按词频与考纲挑过一遍，下载后完全离线。"
        right={
          <div>
            <Button size="sm" variant="secondary" loading={dictBusy} onClick={() => dictFileRef.current?.click()}>
              <Upload className="size-3.5" /> 导入词库文件
            </Button>
            <input
              ref={dictFileRef}
              type="file"
              accept=".json,.csv,.tsv,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await importDictionary(file);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Database className="size-4 text-gray-800" /> 本地词库
        </span>
      </CardTitle>
      <div className="space-y-2 rounded-lg bg-background-200 p-3 shadow-geist-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="t-label-13 font-medium text-gray-900">内置词典 · 一键离线</span>
          <span className="t-label-12 text-gray-700">ECDICT 子集（MIT）· 下载后不联网、查词 &lt;10ms</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {BUILTIN_DICTS.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant="secondary"
              loading={builtinBusy === d.id}
              disabled={Boolean(builtinBusy)}
              onClick={() => importBuiltin(d)}
            >
              <DownloadCloud className="size-3.5" /> {d.name} · {Math.round(d.words / 1000)}k 词（
              {(d.gzipBytes / 1048576).toFixed(1)}MB）
            </Button>
          ))}
        </div>
        {builtinBusy ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-700 transition-[width]"
              style={{ width: `${Math.round(builtinProgress * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      {dictionaries.length === 0 ? (
        <EmptyState
          icon={<HardDrive className="size-4" />}
          title="尚未导入本地词库"
          desc="ECDICT stardict.csv、OALD 导出 JSON、「单词 → 内容」字典都认；几十万条也能吃下，只是首次检索会慢一点。"
        />
      ) : (
        <div className="space-y-2">
          {dictionaries.map((dict) => (
            <div key={dict.id} className="flex items-center gap-3 rounded-lg bg-background-200 p-2.5 shadow-geist-border">
              <Database className="size-4 shrink-0 text-gray-800" />
              <div className="min-w-0 flex-1">
                <div className="t-label-14 truncate font-medium">{dict.name}</div>
                <div className="t-label-12 text-gray-800">
                  {dict.count.toLocaleString()} 条 · {dict.note ?? ""} · {new Date(dict.importedAt).toLocaleDateString()}
                </div>
              </div>
              <Badge variant="green" size="sm">
                已就绪
              </Badge>
              <IconButton
                label="删除词库"
                className="text-gray-800 hover:text-red-900"
                onClick={async () => {
                  await deleteLocalDictionaryData(dict.id);
                  dropDictionaryCache(dict.id);
                  removeDictionary(dict.id);
                  toast.success("已删除本地词库");
                }}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
