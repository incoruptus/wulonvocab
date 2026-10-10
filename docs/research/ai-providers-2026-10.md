# AI 服务商接入调研（R3 · 2026-10-10 实测）

> 用途：AI 配置体验（服务商预设 / 拉取模型 / 测试连接）的实现依据。
> 测试：curl.exe，OPTIONS 预检带 `Origin: http://localhost:3000` + `Access-Control-Request-Headers: authorization,content-type`；
> `api.openai.com` 经代理 127.0.0.1:7890。

## 0. 结论速览

- **8 家全部通过 CORS**（预检/GET /models/POST chat 预检均返回 ACAO）→ 纯前端直连方案成立。
- 唯一网络障碍：`api.openai.com` 大陆直连超时（需代理；浏览器自动跟随系统代理）。
- 可直接拉模型清单：DeepSeek、Moonshot、OpenAI、SiliconFlow、OpenRouter（公开）、ModelScope（公开）。
- **不可信**：智谱、DashScope 的 `/models`（路由存在但鉴权后行为无法确认）→ 硬编码兜底。
- 鉴权统一 `Authorization: Bearer <key>`。

## 1. Provider 预设（TS 可直接用，见实施时的 `src/lib/ai/providers.ts`）

| id | label | baseUrl | 模型清单 | JSON 模式 | 特殊注意 |
| --- | --- | --- | --- | --- | --- |
| deepseek | DeepSeek | https://api.deepseek.com/v1 | full（带 input_modalities） | json_object | 401 返回纯文本非 JSON；谷时半价；`/v1` 可省 |
| openai | OpenAI | https://api.openai.com/v1 | basic（仅 id） | json_schema | 大陆需代理；推理模型拒绝 max_tokens → 回退 max_completion_tokens |
| moonshot | Kimi（Moonshot） | https://api.moonshot.cn/v1 | full（supports_image_in） | json_schema | 国际站 api.moonshot.ai；平台 Key 不混用；旧模型名已下线 |
| zhipu | 智谱 GLM | https://open.bigmodel.cn/api/paas/v4 | unverified（硬编码） | json_object | 端点非 /v1；temperature (0,1) 不含 0；视觉白名单（glm-5.3-flash 等） |
| dashscope | 阿里百炼 Qwen | https://dashscope.aliyuncs.com/compatible-mode/v1 | unverified（硬编码） | json_schema | 特殊路径 /compatible-mode/v1；Key 与地域强绑定；新用户每模型 100 万 token 免费 |
| siliconflow | 硅基流动 | https://api.siliconflow.cn/v1 | basic（无能力位） | partial | 模型 ID 带组织前缀；免费档真实存在；?type= 过滤可用 |
| openrouter | OpenRouter | https://openrouter.ai/api/v1 | **public 无需 Key**（最富字段） | partial | :batch 约半价、:free 免费、~ 浮动别名需过滤 |
| modelscope | ModelScope（实验） | https://api-inference.modelscope.cn/v1 | public | unknown | 聊天补全未测通（400 Invalid model id），上架前复测 |
| custom | 自定义 | — | try/catch 静默降级 | unknown | 探针失败不阻断保存 |

**拉模型 / 探针客户端要点**：
- `fetchModels`: `GET {baseUrl}/models`，需要时带 Bearer；解析 `json.data[]`（各家形状差异大，见下表）。
- `probeConnection`: `POST chat/completions` with `max_tokens: 1`（400 时回退 `max_completion_tokens: 16`）；
  响应体 `text()` 截 300 字（DeepSeek 401 为纯文本）。
- 探针状态映射：401=Key 错；400=参数/模型；404=模型名错；429=限流/欠费；200=连通。

**/models 能力字段**：
- DeepSeek: `input_modalities`（直接判 🖼）；Moonshot: `supports_image_in`；OpenRouter: `architecture.input_modalities` + `pricing` + `supported_parameters`；
- OpenAI / SiliconFlow / ModelScope：无能力位 → 硬编码视觉白名单兜底。

## 2. CORS 实测（2026-10-10，未带 Key）

| 服务商 | OPTIONS 预检 | GET /models（无 Key） | POST chat 预检 | ACAO 类型 |
| --- | --- | --- | --- | --- |
| DeepSeek | 200 | 401 + ACAO | 200 | echo |
| OpenAI（代理） | 200 | 401 + ACAO | 200 | `*` / echo |
| Moonshot CN/国际 | 204 | 401 + ACAO | 204 | echo |
| 智谱 | 200（Max-Age 3600） | 401 + ACAO | 200 | echo |
| DashScope 旧域 | 200 | 401 + ACAO | 200 | `*` |
| DashScope 空间域 | 200 | — | — | echo + credentials |
| SiliconFlow | 204（Max-Age 43200） | 401 + ACAO | 204 | `*` |
| OpenRouter | 204 | **200 公开** | 204 | `*` |
| ModelScope | 204 | **200 公开** | 204 | `*` |

局限：除 OpenRouter/ModelScope 外为无 Key 实测；401 响应同样带 CORS 头（边缘层统一附加），带 Key 置信度高但以上架前复测为准。

## 3. OpenRouter 富模型选择器（实测 458 模型）

字段用途：
- `id`（存库）/ `name`（展示）/ `context_length`（「256K」标签）
- `architecture.input_modalities.includes('image')` → 🖼
- `pricing.prompt/completion`（字符串 USD/token，×1e6 → `$/M`）；`=== "0"` → 💰 免费（联合 `:free` 后缀判定，排除 `~` 浮动别名）
- `supported_parameters`：`tools`(390) / `response_format`(391) / `structured_outputs`(377) / `reasoning`(330) → 🔧/🧩/🧠 徽标
- 过滤默认列表：排除 `:batch` 与 `~` 前缀（或折叠分组）

## 4. 免费/低价档（可验证事实）

- 智谱：GLM-4.7-Flash / GLM-4.6V-Flash / GLM-4V-Flash 等免费档；glm-4.7-flashx ¥0.5/¥3。
- 阿里百炼：新用户每模型 100 万 Token 免费（90 天，华北2）。
- SiliconFlow：Xing4.0-29B、Hunyuan-MT-7B、PaddleOCR-VL-1.5、bge 系列等免费。
- OpenRouter：19 个零价模型（:free 系）。
- DeepSeek：无免费档，谷时半价（峰值 UTC 周一~五 01-04、06-10）。

## 5. 定价快照（2026-10-10，每百万 token）

| 服务商 | 快档 | 强档 | 视觉 |
| --- | --- | --- | --- |
| DeepSeek (USD) | flash 谷 $0.15/峰 $0.30 入、$0.6/$1.2 出（缓存 $0.003/$0.006） | v4-pro $0.66/$1.98 入 | flash 支持图片 |
| Moonshot (CNY) | kimi-k2.6 ¥6.5/¥27（缓存 ¥1.1） | kimi-k3 ¥20/¥100 | k3/k2.6 图+视频 |
| 智谱 (CNY) | glm-4.7-flash 免费；flashx ¥0.5/¥3 | glm-5.3 ¥8/¥28 | glm-5.3-flash ¥0.8/¥2.8 |
| DashScope (CNY) | qwen3.7-flash ¥0.2/¥0.8 | qwen3.8-max ¥12/¥36 | qwen3.8-omni-flash ¥0.8/¥2.7 |
| SiliconFlow (CNY) | Qwen3.5-122B ¥0.8/¥6.4 | GLM-5.3 ¥8/¥28 | GLM-4.5V ¥1/¥6 |
| OpenRouter (USD) | gpt-6-luna $0.1/$0.5 | gpt-6.1-sol $2/$10 | 458 中 296 支持图片 |

> ⚠️ 未能实测（诚实标注）：OpenAI 官方定价/模型文档、智谱与 DashScope 的 /models 鉴权后形状、ModelScope 聊天补全与额度页。上架前用真实 Key 复测。

## 6. 来源

api-docs.deepseek.com（pricing/list-models）、platform.kimi.com/docs（models/pricing）、docs.bigmodel.cn（pricing/openapi spec 扫描确认无 /models）、help.aliyun.com（compatibility/new-free-quota/billing）、siliconflow.cn/pricing + docs（models-get/json-mode/multimodal）、openrouter.ai/api/v1/models（实测）、api-inference.modelscope.cn/v1/models（实测）。
