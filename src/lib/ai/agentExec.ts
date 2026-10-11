import type { SectionType } from "../types";
import { draftToValues } from "../importer";
import { makeEntry } from "../presets";
import { isValueEmpty } from "../sections";
import { useAppStore } from "../store";
import type { ToolExecOutcome, ToolExecutor } from "./agent";

/**
 * Agent 工具执行器：绑定到 store 的唯一写入路径。
 * 危险操作（改 schema / 删除）返回 needsConfirm + apply，由 UI 确认后再执行。
 */
export function makeAgentExecutor(bookId: string): ToolExecutor {
  return async (name, args): Promise<ToolExecOutcome> => {
    const store = useAppStore.getState();
    const book = store.books.find((b) => b.id === bookId);
    if (!book) throw new Error("词库不存在（可能已被删除）");

    switch (name) {
      case "find_entries": {
        const query = String(args.query ?? "").trim().toLowerCase();
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
        const sectionTypeOf = (key: string): SectionType =>
          book.schema.sections.find((s) => s.key === key)?.type ?? "text";
        const rows = book.entries
          .filter((e) => (query ? e.headword.toLowerCase().includes(query) : true))
          .slice(0, limit)
          .map((e) => ({
            id: e.id,
            headword: e.headword,
            tags: e.tags,
            filled: Object.entries(e.values)
              .filter(([key, v]) => !isValueEmpty(sectionTypeOf(key), v))
              .map(([key]) => key),
          }));
        return { result: { total: book.entries.length, matched: rows.length, rows } };
      }

      case "add_entries": {
        const input = Array.isArray(args.entries) ? args.entries : [];
        if (!input.length) throw new Error("entries 不能为空");
        if (input.length > 200) throw new Error("一次最多新增 200 条");
        const entries = input.map((raw) => {
          const rec = raw as { headword?: unknown; tags?: unknown; values?: unknown };
          const headword = String(rec.headword ?? "").trim();
          if (!headword) throw new Error("存在缺少 headword 的词条");
          // 与其它写入路径一致：过 schema 归一化（拒绝畸形值污染数据）
          const { values } = draftToValues(
            (rec.values && typeof rec.values === "object" ? rec.values : {}) as Record<string, unknown>,
            book.schema,
            {},
            { overwrite: true },
          );
          return makeEntry({
            headword,
            tags: Array.isArray(rec.tags) ? rec.tags.map(String) : [],
            values,
            source: { kind: "ai", label: "AI 管家", at: Date.now() },
          });
        });
        store.appendEntries(book.id, entries); // 重复词头自动合并
        return { result: { added: entries.length, headwords: entries.map((e) => e.headword) } };
      }

      case "update_entries": {
        const updates = Array.isArray(args.updates) ? args.updates : [];
        if (!updates.length) throw new Error("updates 不能为空");
        if (updates.length > 200) throw new Error("一次最多更新 200 条");
        // 应用到最新状态（确认流会延迟执行，必须重新取书）
        const run = (): { updated: number; filledFields: number; detail: unknown[] } => {
          const store2 = useAppStore.getState();
          const bk = store2.books.find((b) => b.id === bookId);
          if (!bk) throw new Error("词库不存在（可能已被删除）");
          const detail: unknown[] = [];
          let updated = 0;
          let filled = 0;
          for (const raw of updates) {
            const rec = raw as { headword?: unknown; values?: unknown; overwrite?: unknown };
            const headword = String(rec.headword ?? "").trim().toLowerCase();
            const entry = bk.entries.find((e) => e.headword.toLowerCase() === headword);
            if (!entry) {
              detail.push({ headword: rec.headword, error: "词库中没有这个词" });
              continue;
            }
            const { values, added } = draftToValues(
              (rec.values && typeof rec.values === "object" ? rec.values : {}) as Record<string, unknown>,
              bk.schema,
              entry.values,
              { overwrite: Boolean(rec.overwrite) },
            );
            store2.updateEntry(bookId, entry.id, { values });
            updated += 1;
            filled += added.length;
            detail.push({ headword: entry.headword, filledFields: added });
          }
          return { updated, filledFields: filled, detail };
        };
        // 覆盖已有内容属于破坏性操作：即使模型声明了 overwrite 也先请用户确认
        const wantsOverwrite = updates.some((u) => Boolean((u as { overwrite?: unknown })?.overwrite));
        if (wantsOverwrite) {
          const words = updates
            .slice(0, 5)
            .map((u) => String((u as { headword?: unknown }).headword ?? ""))
            .filter(Boolean)
            .join("、");
          return {
            needsConfirm: true,
            confirmSummary: `覆盖 ${updates.length} 个词条的非空字段（${words}${updates.length > 5 ? "…" : ""}），会替换已有内容`,
            result: null,
            apply: () => run(),
          };
        }
        return { result: run() };
      }

      case "add_field": {
        const label = String(args.label ?? "").trim();
        if (!label) throw new Error("字段名不能为空");
        const rawType = String(args.type ?? "text");
        const type: SectionType = (SECTION_TYPES as readonly string[]).includes(rawType) ? (rawType as SectionType) : "text";
        return {
          needsConfirm: true,
          confirmSummary: `给「${book.name}」新增字段「${label}」（类型：${type}）`,
          result: null,
          apply: () => {
            const created = useAppStore.getState().addSection(bookId, { type, label });
            if (!created) throw new Error("字段创建失败");
            return { ok: true, key: created.key, label: created.label };
          },
        };
      }

      case "delete_entries": {
        const words = (Array.isArray(args.headwords) ? args.headwords : []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
        const matches = book.entries.filter((e) => words.includes(e.headword.toLowerCase()));
        if (!matches.length) return { result: { deleted: 0, note: "没有匹配的词条" } };
        const preview = matches.slice(0, 6).map((e) => e.headword).join("、");
        return {
          needsConfirm: true,
          confirmSummary: `删除 ${matches.length} 个词条：${preview}${matches.length > 6 ? "…" : ""}（不可撤销）`,
          result: null,
          apply: () => {
            useAppStore.getState().removeEntries(bookId, matches.map((e) => e.id));
            return { deleted: matches.length };
          },
        };
      }

      default:
        throw new Error(`未知工具：${name}`);
    }
  };
}

const SECTION_TYPES: SectionType[] = [
  "text",
  "markdown",
  "list",
  "tags",
  "pronunciation",
  "senses",
  "examples",
  "keyvalue",
  "transforms",
  "table",
  "image",
  "quote",
  "rating",
  "divider",
];
