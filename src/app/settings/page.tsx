"use client";

import { cloneElement, isValidElement, useMemo, useRef, useState, useId } from "react";
import { toast } from "sonner";
import { Archive, Database, DownloadCloud, ExternalLink, HardDrive, Plus, RefreshCw, Trash2, Upload, Wifi } from "lucide-react";
import type { LookupKind, LookupSourceConfig } from "@/lib/types";
import { runLookup } from "@/lib/lookup";
import {
  CUSTOM_PROVIDER_ID,
  PROVIDER_PRESETS,
  fetchModelList,
  matchProviderId,
  probeConnection,
  probeHint,
  type FetchedModel,
} from "@/lib/ai/providers";
import { buildLocalDictRows, deleteLocalDictionaryData, dropDictionaryCache, makeDictionaryMeta, saveLocalDictionary } from "@/lib/lookup/localdict";
import { BUILTIN_DICTS, downloadBuiltinDict, type BuiltinDict } from "@/lib/lookup/builtinDicts";
import { parseImportText } from "@/lib/importer";
import { defaultSchema } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { TopNav } from "@/components/app/TopNav";
import { Button, IconButton } from "@/components/ui/button";
import { Input, SwitchRow, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { SyncSection } from "@/components/sync/SyncSection";
import { AccentPicker, Badge, Card, CardTitle, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { cx, downloadText } from "@/lib/utils";

const now = () => Date.now();

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
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pb-24 pt-6 sm:space-y-8 sm:px-6 sm:py-8">
        <div>
          <h1 className="t-h-24">设置</h1>
          <p className="t-label-13 mt-1 text-gray-800">词库、字段表、检索配置都只存在这台设备的浏览器里（IndexedDB）：断网可用、刷新不丢、随时导出 JSON 带走。</p>
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
                grow
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
          <CardTitle desc="多个来源同时找词，结果分好组等你挑。">
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

        {/* 备份 */}
        <Card className="space-y-4">
          <CardTitle desc="词库、字段表、检索配置打包成一个 JSON；换电脑、重装浏览器，原样恢复。">
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
                  if (res.ok) {
                    toast.success(`备份恢复完成：${res.books} 个词库`, {
                      description: res.warnings?.length ? res.warnings[0] : undefined,
                    });
                  } else {
                    toast.error(`恢复失败：${res.error}`);
                  }
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

        {/* 跨端同步 */}
        <SyncSection />

        {/* 关于 */}
        <Card className="space-y-2">
          <CardTitle desc="版本 0.1.0 · 界面遵循 Geist 设计系统">关于 WulonVocab</CardTitle>
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
  const [providerId, setProviderId] = useState(() => matchProviderId(source.config.baseUrl));
  const [models, setModels] = useState<FetchedModel[] | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [probe, setProbe] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });

  const modelOptions = useMemo(
    () =>
      (models ?? []).map((m) => ({
        value: m.id,
        label: m.id,
        badge: [m.vision ? "视觉" : "", m.free ? "免费" : "", m.contextK ? `${m.contextK}K` : ""]
          .filter(Boolean)
          .join(" · "),
      })),
    [models],
  );

  const activePreset = PROVIDER_PRESETS.find((p) => p.id === providerId);

  /** 服务商一键填充：只写 Base URL / 模型 / 视觉模型默认值，不动 Key 与自定义内容 */
  const applyPreset = (id: string) => {
    setProviderId(id);
    const preset = PROVIDER_PRESETS.find((p) => p.id === id);
    if (!preset) return; // 自定义：保留现有填写
    updateSource(source.id, {
      config: {
        baseUrl: preset.baseUrl,
        model: preset.models.fast,
        ...(preset.models.vision ? { visionModel: preset.models.vision } : {}),
      },
    });
    setModels(null);
    toast.success(`已按「${preset.label}」填充，粘贴 Key 即可`);
  };

  const pullModels = async () => {
    if (!activePreset) {
      toast.error("自定义服务商没有模型清单，直接填写模型名即可");
      return;
    }
    setModelsBusy(true);
    const t = toast.loading("正在拉取模型列表…");
    try {
      const list = await fetchModelList(activePreset, source.config.apiKey ?? "");
      setModels(list);
      toast.success(`拉取到 ${list.length} 个模型`, { id: t, description: "带「视觉」标注的模型可用于图片识别" });
    } catch (e) {
      toast.error(`拉取失败：${(e as Error).message}`, {
        id: t,
        description: "该服务商可能未开放 /models，可直接手填模型名",
      });
    } finally {
      setModelsBusy(false);
    }
  };

  const runProbe = async () => {
    setProbe({ busy: true });
    try {
      const r = await probeConnection(source.config.baseUrl ?? "", source.config.apiKey ?? "", source.config.model ?? "");
      const hint = r.ok ? "" : probeHint(r.status);
      setProbe({ busy: false, ok: r.ok, text: r.ok ? `连接成功 · ${r.latencyMs}ms` : `${r.status}${hint ? ` · ${hint}` : ""}` });
      if (r.ok) toast.success(`连接成功（${r.latencyMs}ms）`);
      else toast.error(`连接失败：${r.status}${hint ? ` · ${hint}` : ""}`);
    } catch (e) {
      setProbe({ busy: false, ok: false, text: (e as Error).message });
      toast.error((e as Error).message);
    }
  };

  const kindLabel: Record<LookupKind, string> = {
    freedict: "免费 · 无需配置",
    zerodict: "零配置 · 中英",
    localdict: "本地词库",
    youdao: "完整中文 · 需代理",
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
          ariaLabel="启用此数据源"
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
              dictionaryapi.dev：这个来源已多年没更新、时好时坏（默认关闭）。建议改用「网络综合词典」或内置离线词库。
            </p>
          ) : null}

          {source.kind === "zerodict" ? (
            <p className="t-label-12 text-gray-800">
              零配置综合词源：freedictionaryapi.com（音标 / 英文释义 / 例句 / 近反义词 / 词形）＋ MyMemory 中文翻译（每天约 5 千词）。两个来源都无需注册、无需 Key。
            </p>
          ) : null}

          {source.kind === "youdao" ? (
            <div className="space-y-2.5">
              <Labeled label="代理前缀（含 {url} 时会替换为处理过的目标地址，否则直接接在后面）">
                <Input
                  value={source.config.proxyPrefix ?? ""}
                  onChange={(e) => updateSource(source.id, { config: { proxyPrefix: e.target.value } })}
                  placeholder="https://your-proxy.example/?url="
                  className="t-mono-13"
                />
              </Labeled>
              <p className="t-label-12 text-gray-800">
                有道接口不允许网页直接访问，需要一个代理地址（自己搭一个或找现成的都行）。词典音频（dictvoice）无需代理。
              </p>
            </div>
          ) : null}

          {source.kind === "localdict" ? (
            <p className="t-label-12 text-gray-800">
              使用「本地词库」区域导入的词典（{dictionaries.length} 部已就绪）。导入 ECDICT 后，音标 / 释义 / 词形变化 / 考纲标签会自动排进对应字段。
            </p>
          ) : null}

          {source.kind === "ai" ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="服务商（一键填充）">
                  <Select
                    value={providerId}
                    onValueChange={applyPreset}
                    options={[
                      ...PROVIDER_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                      { value: CUSTOM_PROVIDER_ID, label: "自定义（OpenAI 兼容）" },
                    ]}
                  />
                </Labeled>
                <Labeled label="API Base URL">
                  <Input
                    value={source.config.baseUrl ?? ""}
                    onChange={(e) => {
                      updateSource(source.id, { config: { baseUrl: e.target.value } });
                      setProviderId(matchProviderId(e.target.value));
                    }}
                    placeholder="https://api.deepseek.com/v1"
                    className="t-mono-13"
                  />
                </Labeled>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="模型">
                  <Combobox
                    value={source.config.model ?? ""}
                    onValueChange={(v) => updateSource(source.id, { config: { model: v } })}
                    options={modelOptions}
                    allowCustom
                    loading={modelsBusy}
                    placeholder="deepseek-chat / gpt-4o-mini …"
                    searchPlaceholder={models ? "搜索模型…" : "输入模型名（或先拉取列表）"}
                    emptyText="没有匹配的模型——回车直接使用输入的名字"
                    className="t-mono-13"
                  />
                  {models ? (
                    <div className="t-label-12 mt-1 text-gray-700">
                      已拉取 {models.length} 个模型——可搜索；标「视觉」的能看图
                    </div>
                  ) : null}
                </Labeled>
                <Labeled label="API Key（只保存在本机）">
                  <Input
                    type="password"
                    value={source.config.apiKey ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { apiKey: e.target.value } })}
                    placeholder={activePreset?.keyHint ?? "sk-…（仅保存在本机）"}
                  />
                </Labeled>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" loading={modelsBusy} onClick={pullModels}>
                  <RefreshCw className="size-3.5" /> 拉取模型列表
                </Button>
                <Button size="sm" variant="secondary" loading={probe.busy} onClick={runProbe}>
                  <Wifi className="size-3.5" /> 测连接（只发 1 个 token）
                </Button>
                {activePreset?.createKeyUrl ? (
                  <a
                    href={activePreset.createKeyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="t-label-12 inline-flex items-center gap-1 text-blue-900 hover:underline"
                  >
                    获取 Key <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {!probe.busy && probe.text ? (
                  <span className={cx("t-label-12", probe.ok ? "text-green-900" : "text-red-900")}>
                    {probe.ok ? "✓ " : "✗ "}
                    {probe.text}
                  </span>
                ) : null}
              </div>
              {activePreset?.note ? <p className="t-label-12 text-gray-700">{activePreset.note}</p> : null}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Labeled label="视觉模型（可选，图片 / 扫描件导入用）">
                  <Input
                    value={source.config.visionModel ?? ""}
                    onChange={(e) => updateSource(source.id, { config: { visionModel: e.target.value } })}
                    placeholder={activePreset?.models.vision ?? "如 glm-4v-flash"}
                    className="t-mono-13"
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
                    onValueChange={(v) => updateSource(source.id, { config: { method: v } })}
                    options={[
                      { value: "GET", label: "GET" },
                      { value: "POST", label: "POST" },
                    ]}
                  />
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
              <Labeled label="字段对照（JSON：字段名 → 返回内容里的位置；$ 代表整个返回）">
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
  const id = useId();
  const control =
    isValidElement(children) && !(children.props as { id?: string }).id
      ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
      : children;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="t-label-12 block text-gray-800">
        {label}
      </label>
      {control}
    </div>
  );
}
