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
        const entries = input.map((raw) => {
          const rec = raw as { headword?: unknown; tags?: unknown; values?: unknown };
          const headword = String(rec.headword ?? "").trim();
          if (!headword) throw new Error("存在缺少 headword 的词条");
          return makeEntry({
            headword,
            tags: Array.isArray(rec.tags) ? rec.tags.map(String) : [],
            values: (rec.values && typeof rec.values === "object" ? rec.values : {}) as Record<string, unknown>,
            source: { kind: "ai", label: "AI 管家", at: Date.now() },
          });
        });
        store.appendEntries(book.id, entries); // 重复词头自动合并
        return { result: { added: entries.length, headwords: entries.map((e) => e.headword) } };
      }

      case "update_entries": {
        const updates = Array.isArray(args.updates) ? args.updates : [];
        if (!updates.length) throw new Error("updates 不能为空");
        const detail: unknown[] = [];
        let updated = 0;
        let filled = 0;
        for (const raw of updates) {
          const rec = raw as { headword?: unknown; values?: unknown; overwrite?: unknown };
          const headword = String(rec.headword ?? "").trim().toLowerCase();
          const entry = book.entries.find((e) => e.headword.toLowerCase() === headword);
          if (!entry) {
            detail.push({ headword: rec.headword, error: "词库中没有这个词" });
            continue;
          }
          const { values, added } = draftToValues(
            (rec.values && typeof rec.values === "object" ? rec.values : {}) as Record<string, unknown>,
            book.schema,
            entry.values,
            { overwrite: Boolean(rec.overwrite) },
          );
          store.updateEntry(book.id, entry.id, { values });
          updated += 1;
          filled += added.length;
          detail.push({ headword: entry.headword, filledFields: added });
        }
        return { result: { updated, filledFields: filled, detail } };
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
