import type { LookupDraft } from "../types";
import { parsePosPrefix, sanitizeText } from "../sections";
import { uid } from "../utils";
import type { DictionaryAdapter, LookupContext } from "./types";
import { LookupError, withTimeout } from "./types";

/**
 * 有道词典（非官方 JSON 接口）——内容最丰富的中文词典源：
 * 中文释义（含词性）/ 英式美式音标 / 双语例句 / 词形变化 / 近义词。
 *
 * ⚠️ 该接口不返回 CORS 头，浏览器无法直连；需要配置「代理前缀」：
 *   - 前缀若包含 {url} → 替换为编码后的目标地址（如 Cloudflare Worker）
 *   - 否则直接拼接到完整目标 URL 之前（如 https://your-proxy.example/?url=）
 * 音频字段（dictvoice）无需代理，可在浏览器直接播放。
 */

const DEF_API = "https://dict.youdao.com/jsonapi?q=";

interface YdTr {
  l?: { i?: string | string[] };
}
interface YdWf {
  wf?: { name?: string; value?: string };
}
interface YdSyno {
  syno?: { pos?: string; ws?: { w?: string }[]; tran?: string };
}
interface YoudaoResp {
  ec?: { word?: { ukphone?: string; usphone?: string; trs?: { tr?: YdTr[] }[]; wfs?: YdWf[] }[] };
  blng_sents_part?: { "sentence-pair"?: { sentence?: string; "sentence-translation"?: string }[] };
  syno?: { synos?: YdSyno[] };
}

function buildUrl(word: string, proxyPrefix: string): string {
  const target = `${DEF_API}${encodeURIComponent(word)}`;
  if (!proxyPrefix) return target;
  if (proxyPrefix.includes("{url}")) return proxyPrefix.replace("{url}", encodeURIComponent(target));
  return `${proxyPrefix}${target}`;
}

export const youdaoAdapter: DictionaryAdapter = {
  kind: "youdao",
  async lookup({ word, config, signal }: LookupContext): Promise<LookupDraft> {
    const proxyPrefix = (config.proxyPrefix ?? "").trim();
    const url = buildUrl(word, proxyPrefix);
    const { signal: s, done } = withTimeout(20000, signal);
    let data: YoudaoResp | null = null;
    try {
      const attempt = async () => {
        const res = await fetch(url, { signal: s, headers: { Accept: "application/json" } });
        if (res.status === 403) throw new LookupError("有道接口拒绝了请求（CORS/防盗链）：请配置代理前缀");
        if (!res.ok) throw new LookupError(`请求失败（HTTP ${res.status}）`);
        return (await res.json()) as YoudaoResp;
      };
      data = await attempt();
      // 已知偶发空结果 → 重试一次
      if (!data?.ec?.word?.[0]?.trs?.length) {
        await new Promise((r) => setTimeout(r, 400));
        data = await attempt();
      }
    } catch (e) {
      if (e instanceof LookupError) throw e;
      throw new LookupError("网络请求失败：浏览器直连有道被 CORS 拦截（需在数据源配置中填写代理前缀）");
    } finally {
      done();
    }

    const w = data?.ec?.word?.[0];
    if (!w) throw new LookupError("未收录该单词");

    const values: Record<string, unknown> = {};
    const phonetic: { uk?: string; us?: string } = {};
    if (w.ukphone) phonetic.uk = `/${sanitizeText(w.ukphone)}/`;
    if (w.usphone) phonetic.us = `/${sanitizeText(w.usphone)}/`;
    if (Object.keys(phonetic).length) values.phonetic = phonetic;

    const senses: Record<string, unknown>[] = [];
    for (const trs of w.trs ?? []) {
      for (const tr of trs.tr ?? []) {
        const lines = Array.isArray(tr.l?.i) ? tr.l!.i! : tr.l?.i ? [tr.l.i] : [];
        for (const line of lines) {
          const { pos, rest } = parsePosPrefix(sanitizeText(String(line)));
          if (!rest) continue;
          senses.push({
            id: uid(),
            pos: pos ?? "",
            translation: rest,
            definition: "",
            examples: [],
            usage: "",
            patterns: [],
            synonyms: [],
            antonyms: [],
            collocations: [],
            notes: "",
          });
        }
      }
    }
    if (!senses.length) throw new LookupError("获取到响应但没有解析出释义");

    // 双语例句（去 <b> 高亮）→ 挂到首个义项
    const pairs = data?.blng_sents_part?.["sentence-pair"] ?? [];
    const examples = pairs
      .map((p) => ({
        en: sanitizeText((p.sentence ?? "").replace(/<[^>]{0,40}>/g, "")),
        zh: sanitizeText(p["sentence-translation"] ?? ""),
      }))
      .filter((x) => x.en)
      .slice(0, 3);
    if (examples.length) senses[0].examples = examples;

    // 近义词（按词性匹配到对应义项，否则挂第一个）
    for (const s of data?.syno?.synos ?? []) {
      const ws = (s.syno?.ws ?? []).map((x) => sanitizeText(x.w ?? "")).filter(Boolean);
      if (!ws.length) continue;
      const pos = s.syno?.pos ? parsePosPrefix(s.syno.pos).pos ?? "" : "";
      const target = senses.find((x) => x.pos === pos) ?? senses[0];
      const existing = target.synonyms as string[];
      target.synonyms = [...new Set([...existing, ...ws])].slice(0, 10);
      const tran = sanitizeText(s.syno?.tran ?? "");
      if (tran && !target.notes) target.notes = `辨析：${tran}`;
    }

    // 词形变化
    const transforms = (w.wfs ?? [])
      .map((x) => ({ form: sanitizeText(x.wf?.value ?? ""), pos: "", note: sanitizeText(x.wf?.name ?? "") }))
      .filter((x) => x.form);
    if (transforms.length) values.transforms = transforms;

    values.senses = senses;

    return {
      values,
      summary: {
        headword: word,
        phonetic: phonetic.uk,
        posList: [...new Set(senses.map((s) => String(s.pos)).filter(Boolean))],
        definitions: senses.slice(0, 3).map((s) => String(s.translation ?? "")),
      },
      suggestedTags: ["有道词典"],
    };
  },
};
