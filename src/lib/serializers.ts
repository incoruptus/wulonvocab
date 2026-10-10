import type { Wordbook } from "./types";
import { WULONVOCAB_FORMAT, WULONVOCAB_VERSION } from "./types";

/** 导出为 WulonVocab 标准文档（可再导入、可交给 AI 继续加工） */
export function serializeBookDoc(book: Wordbook, opts: { includeSchema?: boolean } = {}): string {
  const { includeSchema = true } = opts;
  return JSON.stringify(
    {
      format: WULONVOCAB_FORMAT,
      version: WULONVOCAB_VERSION,
      wordbook: {
        name: book.name,
        description: book.description,
        tags: book.tags,
        meta: book.meta,
      },
      ...(includeSchema ? { schema: book.schema } : {}),
      entries: book.entries.map((e) => ({
        headword: e.headword,
        tags: e.tags,
        status: e.status,
        starred: e.starred || undefined,
        values: e.values,
      })),
    },
    null,
    2,
  );
}

/** 仅导出词条数据（不含字段表，导入时自动识别字段） */
export function serializeEntriesOnly(book: Wordbook): string {
  return serializeBookDoc(book, { includeSchema: false });
}
