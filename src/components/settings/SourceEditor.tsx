"use client";

import { cloneElement, isValidElement, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Trash2, Wifi } from "lucide-react";
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
import { defaultSchema } from "@/lib/presets";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Input, SwitchRow, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { Badge } from "@/components/ui/misc";
import { cx } from "@/lib/utils";

/* ---------------- 数据源编辑器 ---------------- */

export function SourceEditor({ source, removable }: { source: LookupSourceConfig; removable: boolean }) {
  const updateSource = useAppStore((s) => s.updateLookupSource);
  const removeSource = useAppStore((s) => s.removeLookupSource);
  const dictionaries = useAppStore((s) => s.dictionaries);
  const { pending: syncPending, run: runSync } = useSyncCommit();
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
          loading={syncPending}
          disabled={syncPending}
          onCheckedChange={(v) => runSync(() => updateSource(source.id, { enabled: v }))}
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
                    emptyText="没有匹配的模型，回车直接使用输入的名字"
                    className="t-mono-13"
                  />
                  {models ? (
                    <div className="t-label-12 mt-1 text-gray-700">
                      已拉取 {models.length} 个模型，可搜索；标「视觉」的能看图
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
