/**
 * AI 服务商预设与辅助调用（依据 docs/research/ai-providers-2026-10.md 的实测矩阵）
 * - 8 家服务商一键填充（Base URL / 常用模型 / 视觉模型）
 * - 拉取模型列表（GET {baseUrl}/models；能力字段可用时标注「视觉」）
 * - 连接探针（max_tokens:1；推理模型 400 时回退 max_completion_tokens）
 * 全部浏览器直连（R3 实测 CORS 全通）；Key 只存本机。
 */

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  createKeyUrl: string;
  keyHint: string;
  /** /models 可用性：full=含能力字段；basic=仅 id；public=无需 Key；unverified=路由存疑（硬编码兜底） */
  supportsModelList: "full" | "basic" | "public" | "unverified";
  modelListAuth: boolean;
  models: { fast: string; strong?: string; vision?: string };
  visionModels?: string[];
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    createKeyUrl: "https://platform.deepseek.com/",
    keyHint: "sk-…",
    supportsModelList: "full",
    modelListAuth: true,
    models: { fast: "deepseek-chat", strong: "deepseek-reasoner", vision: "deepseek-chat" },
    note: "谷时半价；/models 含 input_modalities 可直接判定视觉能力",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    createKeyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    supportsModelList: "basic",
    modelListAuth: true,
    models: { fast: "gpt-4o-mini", strong: "gpt-4o", vision: "gpt-4o-mini" },
    note: "大陆需系统代理；推理模型探针自动回退 max_completion_tokens",
  },
  {
    id: "moonshot",
    label: "Kimi（Moonshot）",
    baseUrl: "https://api.moonshot.cn/v1",
    createKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    keyHint: "sk-…",
    supportsModelList: "full",
    modelListAuth: true,
    models: { fast: "moonshot-v1-8k", strong: "kimi-k2-0905-preview", vision: "moonshot-v1-8k-vision-preview" },
    note: "/models 含 supports_image_in；国际站为 api.moonshot.ai（Key 不混用）",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    createKeyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    keyHint: "id.secret",
    supportsModelList: "unverified",
    modelListAuth: true,
    models: { fast: "glm-4-flash", strong: "glm-4-plus", vision: "glm-4v-flash" },
    visionModels: ["glm-4v-flash", "glm-4v-plus", "glm-4.1v-thinking-flash"],
    note: "端点是 /api/paas/v4（非 /v1）；GLM-4V-Flash 免费档可用",
  },
  {
    id: "dashscope",
    label: "阿里百炼 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    createKeyUrl: "https://bailian.console.aliyun.com/model/settings/api-key",
    keyHint: "sk-…",
    supportsModelList: "unverified",
    modelListAuth: true,
    models: { fast: "qwen-turbo", strong: "qwen-max", vision: "qwen-vl-max" },
    visionModels: ["qwen-vl-max", "qwen-vl-plus", "qwen2.5-vl-72b-instruct"],
    note: "特殊路径 /compatible-mode/v1；Key 与地域绑定；新用户各模型 100 万 token 免费",
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    createKeyUrl: "https://cloud.siliconflow.cn/account/ak",
    keyHint: "sk-…",
    supportsModelList: "basic",
    modelListAuth: true,
    models: { fast: "Qwen/Qwen2.5-7B-Instruct", strong: "deepseek-ai/DeepSeek-V3", vision: "Qwen/Qwen2.5-VL-72B-Instruct" },
    note: "模型 ID 带组织前缀；免费档真实存在（如 GLM-4.5V 系列白名单外仍有免费款）",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    createKeyUrl: "https://openrouter.ai/settings/keys",
    keyHint: "sk-or-…",
    supportsModelList: "public",
    modelListAuth: false,
    models: { fast: "openai/gpt-4o-mini", strong: "anthropic/claude-sonnet-4", vision: "google/gemini-2.0-flash-001" },
    note: "模型清单公开无需 Key；列表带上下文 / 价格 / 模态，可直接筛选免费与视觉模型",
  },
  {
    id: "modelscope",
    label: "ModelScope 魔搭（实验）",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    createKeyUrl: "https://modelscope.cn/my/myaccesstoken",
    keyHint: "ms-…",
    supportsModelList: "public",
    modelListAuth: false,
    models: { fast: "Qwen/Qwen2.5-7B-Instruct" },
    note: "实验特性：聊天补全需真实 Key 复测",
  },
];

export const CUSTOM_PROVIDER_ID = "custom";

export function matchProviderId(baseUrl: string | undefined): string {
  if (!baseUrl) return CUSTOM_PROVIDER_ID;
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return PROVIDER_PRESETS.find((p) => norm(p.baseUrl) === norm(baseUrl))?.id ?? CUSTOM_PROVIDER_ID;
}

/* ---------------- 拉取模型列表 ---------------- */

export interface FetchedModel {
  id: string;
  vision: boolean;
  free: boolean;
  contextK?: number;
}

interface RawModel {
  id?: unknown;
  input_modalities?: unknown;
  supports_image_in?: unknown;
  context_length?: unknown;
  context_window?: unknown;
  architecture?: { input_modalities?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown };
}

export async function fetchModelList(preset: ProviderPreset, apiKey: string): Promise<FetchedModel[]> {
  const base = preset.baseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("请先填写 Base URL");
  const res = await fetch(`${base}/models`, {
    headers: preset.modelListAuth && apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: RawModel[] };
  const list = Array.isArray(json.data) ? json.data : [];
  const visionWhitelist = new Set(preset.visionModels ?? []);
  const visionDefault = preset.models.vision;
  return list
    .map((m): FetchedModel | null => {
      const id = typeof m.id === "string" ? m.id : "";
      if (!id) return null;
      const modality = Array.isArray(m.input_modalities)
        ? m.input_modalities
        : Array.isArray(m.architecture?.input_modalities)
          ? m.architecture.input_modalities
          : null;
      const vision = modality
        ? modality.includes("image")
        : Boolean(m.supports_image_in) || visionWhitelist.has(id) || id === visionDefault;
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      const free = id.endsWith(":free") || (Number.isFinite(prompt) && prompt === 0 && Number.isFinite(completion) && completion === 0);
      const ctx = Number(m.context_length ?? m.context_window);
      return { id, vision, free, contextK: Number.isFinite(ctx) && ctx > 0 ? Math.round(ctx / 1000) : undefined };
    })
    .filter((m): m is FetchedModel => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* ---------------- 连接探针 ---------------- */

export interface ProbeResult {
  ok: boolean;
  status: number;
  detail: string;
  latencyMs: number;
}

export function probeHint(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "Key 无效或未配置";
    case 404:
      return "模型名可能不对";
    case 429:
      return "限流或额度不足";
    case 400:
      return "参数或模型不被接受";
    default:
      return "";
  }
}

/** max_tokens:1 探针；推理模型拒绝 max_tokens 时回退 max_completion_tokens:16 */
export async function probeConnection(baseUrl: string, apiKey: string, model: string): Promise<ProbeResult> {
  const norm = baseUrl.trim().replace(/\/+$/, "");
  if (!norm) throw new Error("请先填写 Base URL");
  if (!model.trim()) throw new Error("请先填写模型名");
  const endpoint = norm.endsWith("/chat/completions") ? norm : `${norm}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  const messages = [{ role: "user", content: "ping" }];
  const t0 = performance.now();
  const attempt = async (body: Record<string, unknown>) => {
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    return { res, text };
  };
  let r = await attempt({ model: model.trim(), messages, max_tokens: 1 });
  if (r.res.status === 400) {
    r = await attempt({ model: model.trim(), messages, max_completion_tokens: 16 });
  }
  return {
    ok: r.res.ok,
    status: r.res.status,
    detail: r.text.slice(0, 300),
    latencyMs: Math.round(performance.now() - t0),
  };
}
