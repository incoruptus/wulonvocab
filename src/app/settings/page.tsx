"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, Database, DownloadCloud, HardDrive, Plus, RefreshCw, Trash2, Upload, Wifi } from "lucide-react";
import type { LookupKind, LookupSourceConfig } from "@/lib/types";
import { runLookup } from "@/lib/lookup";
import { buildLocalDictRows, deleteLocalDictionaryData, dropDictionaryCache, makeDictionaryMeta, saveLocalDictionary } from "@/lib/lookup/localdict";
import { parseImportText } from "@/lib/importer";
import { defaultSchema } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { TopNav } from "@/components/app/TopNav";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { AccentPicker, Badge, Card, CardTitle, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { downloadText } from "@/lib/utils";

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const sources = useAppStore((s) => s.lookupSources);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const addSource = useAppStore((s) => s.addLookupSource);
  const importBackupJson = useAppStore((s) => s.importBackupJson);
  const exportBackupJson = useAppStore((s) => s.exportBackupJson);
  const addDictionary = useAppStore((s) => s.addDictionary);
  const removeDictionary = useAppStore((s) => s.removeDictionary);

  const [clearOpen, setClearOpen] = useState(false);
  const [dictBusy, setDictBusy] = useState(false);
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

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-8">
        <div>
          <h1 className="t-h-24">设置</h1>
          <p className="t-label-13 mt-1 text-gray-800">所有数据保存在本机浏览器中（IndexedDB），不上传任何服务器。</p>
        </div>

        {/* 外观 */}
        <Card className="space-y-4">
          <CardTitle desc="界面主题与强调色">外观</CardTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="t-label-13 font-medium text-gray-900">主题</div>
              <SegmentedControl
                value={settings.theme}
                onValueChange={(v) => setSettings({ theme: v })}
                options={[
                  { value: "light", label: "浅色" },
                  { value: "dark", label: "深色" },
                  { value: "system", label: "跟随系统" },
                ]}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <div className="t-label-13 font-medium text-gray-900">强调色</div>
              <AccentPicker value={settings.accent} onChange={(v) => setSettings({ accent: v })} />
              <p className="t-label-12 text-gray-700">用于界面点缀；导出卡片的强调色在导出工作室中单独设置。</p>
            </div>
          </div>
        </Card>

        {/* 数据源 */}
        <Card className="space-y-4">
          <CardTitle desc="检索单词时使用的词典数据源，可随时启用 / 停用">
            <span className="inline-flex items-center gap-2">
              <Wifi className="size-4 text-gray-800" /> 词典检索数据源
            </span>
          </CardTitle>
          <div className="space-y-3">
            {sources.map((source) => (
              <SourceEditor key={source.id} source={source} removable={!["freedict", "localdict", "ai", "http"].includes(source.id)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { kind: "http", label: "自定义 HTTP API" },
                { kind: "ai", label: "AI 数据源" },
              ] as { kind: LookupKind; label: string }[]
            ).map((opt) => (
              <Button
                key={opt.kind}
                variant="secondary"
                size="sm"
                onClick={() => {
                  addSource({
                    kind: opt.kind,
                    label: opt.label,
                    enabled: false,
                    config:
                      opt.kind === "ai"
                        ? { baseUrl: "", model: "", apiKey: "", language: "中文" }
                        : { urlTemplate: "", method: "GET", headers: "{}", resultPath: "", mapping: "{}" },
                  });
                  toast.success("已添加数据源，请填写配置并启用");
                }}
              >
                <Plus className="size-3.5" /> {opt.label}
              </Button>
            ))}
          </div>
        </Card>

        {/* 本地词库 */}
        <Card className="space-y-4">
          <CardTitle
            desc="导入 OALD / ECDICT 等词典数据集（JSON / CSV），作为离线检索源；数据只存本机"
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
          {dictionaries.length === 0 ? (
            <EmptyState
              icon={<HardDrive className="size-4" />}
              title="尚未导入本地词库"
              desc="支持 ECDICT stardict.csv、OALD 导出 JSON、以及通用 { 单词 → 内容 } 字典。建议使用常用词子集（数万条）以获得最佳性能。"
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

        {/* 备份 */}
        <Card className="space-y-4">
          <CardTitle desc="导出完整备份（词库 + 设置 + 数据源），或从备份恢复">
            <span className="inline-flex items-center gap-2">
              <Archive className="size-4 text-gray-800" /> 备份与恢复
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                downloadText(`wulonvocab-backup-${Date.now()}.json`, exportBackupJson());
                toast.success("备份已导出");
              }}
            >
              <DownloadCloud className="size-3.5" /> 导出备份
            </Button>
            <label>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const res = importBackupJson(await file.text());
                  if (res.ok) toast.success(`备份恢复完成：${res.books} 个词库`);
                  else toast.error(`恢复失败：${res.error}`);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-background-100 px-3.5 text-[14px] font-medium text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100">
                <Upload className="size-3.5" /> 恢复备份
              </span>
            </label>
            <Button variant="tertiary" className="text-red-900" onClick={() => setClearOpen(true)}>
              <Trash2 className="size-3.5" /> 清空所有数据
            </Button>
          </div>
          <p className="t-label-12 text-gray-700">
            提示：删除浏览器数据会同时清空词库，请定期导出备份或使用「导出 JSON」保存单个词库。
          </p>
        </Card>

        {/* 关于 */}
        <Card className="space-y-2">
          <CardTitle desc="版本 0.1.0 · Geist 设计系统 · Next.js 16 / React 19">关于 WulonVocab</CardTitle>
          <p className="t-label-13 text-gray-800">
            WulonVocab 是一个本地优先的单词本工坊：动态字段管理、宽容的 JSON 导入、打印级 PDF/PNG 导出。
            字段结构与数据格式属于你，随时可以导出 JSON 带走。
          </p>
          <p className="t-label-12 text-gray-700">
            新词库默认使用「牛津词典风」模板的 10 个字段，可在「字段设计」中自由增删、排序与配置。
          </p>
        </Card>
      </main>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogHeader title="清空所有数据" desc="将删除全部词库、设置与本地词库缓存，且不可恢复。建议先导出备份。" />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              try {
                const { clear } = await import("idb-keyval");
                await clear();
              } catch {
                /* ignore */
              }
              localStorage.removeItem("wulonvocab-v1");
              location.reload();
            }}
          >
            确认清空
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ---------------- 数据源编辑器 ---------------- */

function SourceEditor({ source, removable }: { source: LookupSourceConfig; removable: boolean }) {
  const updateSource = useAppStore((s) => s.updateLookupSource);
  const removeSource = useAppStore((s) => s.removeLookupSource);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const [testWord, setTestWord] = useState("abandon");
  const [testing, setTesting] = useState(false);

  const kindLabel: Record<LookupKind, string> = {
    freedict: "免费 · 无需配置",
    localdict: "本地词库",
    ai: "OpenAI 兼容接口",
    http: "自定义接口",
  };

  const test = async () => {
    setTesting(true);
    const t = toast.loading("正在测试…");
    try {
      const schema = useAppStore.getState().books[0]?.schema ?? defaultSchema();
      const res = await runLookup(testWord.trim(), [{ ...source, enabled: true }], schema, {
        localDictIds: dictionaries.map((d) => d.id),
      });
      const r = res[0];
      if (r?.ok) {
        toast.success(`测试成功：${r.tookMs}ms，返回 ${Object.keys(r.draft?.values ?? {}).length} 个字段`, { id: t });
      } else {
        toast.error(`测试失败：${r?.error ?? "无结果"}`, { id: t });
      }
    } catch (e) {
      toast.error(`测试失败：${(e as Error).message}`, { id: t });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl bg-background-200 p-3 shadow-geist-border">
      <div className="flex items-center gap-2">
        <span className="t-label-14 flex-1 font-medium">{source.label}</span>
        <Badge variant="gray" size="sm">
          {kindLabel[source.kind]}
        </Badge>
        <SwitchRow
          label=""
          checked={source.enabled}
          onCheckedChange={(v) => updateSource(source.id, { enabled: v })}
        />
        {removable ? (
          <IconButton label="移除数据源" size="sm" className="text-gray-800 hover:text-red-900" onClick={() => removeSource(source.id)}>
            <Trash2 className="size-3.5" />
          </IconButton>
        ) : null}
      </div>

      {source.enabled ? (
        <div className="mt-3 space-y-2.5">
          {source.kind === "freedict" ? (
            <p className="t-label-12 text-gray-800">
              免费公开 API（dictionaryapi.dev）：英文释义、音标、近反义词。无需配置；如网络不可达可改用本地词库或 AI 数据源。
            </p>
          ) : null}

          {source.kind === "localdict" ? (
            <p className="t-label-12 text-gray-800">
              使用「本地词库」区域导入的词典（{dictionaries.length} 部已就绪）。导入 ECDICT 后，音标 / 释义 / 词形变化 / 考纲标签会自动映射到字段。
            </p>
          ) : null}

          {source.kind === "ai" ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="API Base URL">
                  <Input
                    value={source.config.baseUrl ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { baseUrl: e.target.value } })}
                    placeholder="https://api.deepseek.com/v1"
                    className="t-mono-13"
                  />
                </Labeled>
                <Labeled label="模型">
                  <Input
                    value={source.config.model ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { model: e.target.value } })}
                    placeholder="deepseek-chat / gpt-4o-mini …"
                    className="t-mono-13"
                  />
                </Labeled>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="API Key">
                  <Input
                    type="password"
                    value={source.config.apiKey ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { apiKey: e.target.value } })}
                    placeholder="sk-…（仅保存在本机）"
                  />
                </Labeled>
                <Labeled label="释义语言">
                  <Input
                    value={source.config.language ?? "中文"}
                    onChange={(e) => updateSource(source.id, { config: { language: e.target.value } })}
                  />
                </Labeled>
              </div>
              <Labeled label="补充要求（可选）">
                <Textarea
                  rows={2}
                  value={source.config.extraPrompt ?? ""}
                  onChange={(e) => updateSource(source.id, { config: { extraPrompt: e.target.value } })}
                  placeholder="例如：面向考研，侧重熟词僻义与真题例句"
                  className="text-[13px]"
                />
              </Labeled>
            </div>
          ) : null}

          {source.kind === "http" ? (
            <div className="space-y-2.5">
              <Labeled label="URL 模板（用 {word} 占位）">
                <Input
                  value={source.config.urlTemplate ?? ""}
                  onChange={(e) => updateSource(source.id, { config: { urlTemplate: e.target.value } })}
                  placeholder="https://api.example.com/dict?q={word}"
                  className="t-mono-13"
                />
              </Labeled>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="请求方法">
                  <Select
                    value={source.config.method ?? "GET"}
                    onChange={(e) => updateSource(source.id, { config: { method: e.target.value } })}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </Select>
                </Labeled>
                <Labeled label="结果路径（可选，点号取值）">
                  <Input
                    value={source.config.resultPath ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { resultPath: e.target.value } })}
                    placeholder="data.entry / items[0]"
                    className="t-mono-13"
                  />
                </Labeled>
              </div>
              <Labeled label="请求头（JSON，可放 Authorization）">
                <Textarea
                  rows={2}
                  value={source.config.headers ?? "{}"}
                  onChange={(e) => updateSource(source.id, { config: { headers: e.target.value } })}
                  className="t-mono-13"
                />
              </Labeled>
              <Labeled label="字段映射（JSON：字段key → 响应路径；$ 表示整个对象）">
                <Textarea
                  rows={3}
                  value={source.config.mapping ?? "{}"}
                  onChange={(e) => updateSource(source.id, { config: { mapping: e.target.value } })}
                  placeholder={'{ "phonetic": "entry.ipa", "senses": "$.entry.senses" }'}
                  className="t-mono-13"
                />
              </Labeled>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Input value={testWord} onChange={(e) => setTestWord(e.target.value)} className="h-8 w-40 text-[13px]" placeholder="测试单词" />
            <Button size="sm" variant="secondary" loading={testing} onClick={test}>
              <RefreshCw className="size-3.5" /> 测试
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="t-label-12 text-gray-800">{label}</div>
      {children}
    </div>
  );
}
