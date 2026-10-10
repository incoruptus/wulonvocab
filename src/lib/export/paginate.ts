/**
 * 确定性分页：把「已测高度的内容块」分配到固定尺寸的页面 / 分栏。
 * 纯函数、无 DOM 依赖，便于单元测试。
 *
 * 高度模型（px）：
 * - 同列相邻块之间固定 gap；
 * - 可拆分块（senses / examples / list ...）记录 `split = { header, items[] }`，
 *   内容超高时按「条目」拆分到下一列 / 下一页，续块重复小节标题并带「续」标记；
 * - `glueWithNext`（词条头部）保证头部与首个内容块不分离（孤行控制）。
 */

export interface MeasuredUnit {
  from: number;
  to: number;
  h: number;
}

export interface MeasuredBlock {
  id: string;
  entryId: string;
  kind: "header" | "section";
  sectionId?: string;
  height: number;
  /** 可拆分包：header 为小节标题 + 空列表的高度；units 为可拆分单元（按单元整体移动/续排） */
  split?: { header: number; units: MeasuredUnit[] };
  glueWithNext?: boolean;
  /** 与本列上一块之间的间距（px），由词条间距 / 字段间距决定 */
  gapBefore?: number;
}

export interface PlannedBlock {
  id: string;
  entryId: string;
  kind: "header" | "section";
  sectionId?: string;
  slice?: [number, number];
  continued: boolean;
}

export interface PlannedPage {
  index: number;
  slots: PlannedBlock[][];
}

export interface PaginationResult {
  pages: PlannedPage[];
  entryFirstPage: Record<string, number>;
  overflowBlocks: number;
}

export interface PaginateOptions {
  columns: number;
  columnHeight: number;
  /** 同列块间距 px */
  gap?: number;
}

export function paginate(blocks: MeasuredBlock[], options: PaginateOptions): PaginationResult {
  const columns = Math.max(1, options.columns);
  const columnHeight = Math.max(1, options.columnHeight);
  const defaultGap = options.gap ?? 0;

  const pages: PlannedPage[] = [{ index: 0, slots: Array.from({ length: columns }, () => []) }];
  const entryFirstPage: Record<string, number> = {};
  let overflowBlocks = 0;

  let pageIndex = 0;
  let slotIndex = 0;
  let used = 0;
  let blockCount = 0;

  const slot = () => pages[pageIndex].slots[slotIndex];
  const gapFor = (block: MeasuredBlock) => block.gapBefore ?? defaultGap;
  const remaining = (block: MeasuredBlock) =>
    columnHeight - used - (blockCount > 0 ? gapFor(block) : 0);

  const advance = () => {
    slotIndex += 1;
    if (slotIndex >= columns) {
      pageIndex += 1;
      slotIndex = 0;
      pages.push({ index: pageIndex, slots: Array.from({ length: columns }, () => []) });
    }
    used = 0;
    blockCount = 0;
  };

  const place = (block: MeasuredBlock, slice: [number, number] | undefined, height: number) => {
    const planned: PlannedBlock = {
      id: block.id,
      entryId: block.entryId,
      kind: block.kind,
      sectionId: block.sectionId,
      slice,
      continued: false,
    };
    if (entryFirstPage[block.entryId] === undefined) entryFirstPage[block.entryId] = pageIndex;
    slot().push(planned);
    used += (blockCount > 0 ? gapFor(block) : 0) + height;
    blockCount += 1;
  };

  const firstUnitHeight = (b: MeasuredBlock): number => {
    if (b.split && b.split.units.length) return b.split.header + b.split.units[0].h;
    return b.height;
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    // 孤行控制：词条头部必须与其后第一块同列
    if (block.glueWithNext && i + 1 < blocks.length) {
      const next = blocks[i + 1];
      const needed = block.height + gapFor(next) + firstUnitHeight(next);
      if (needed <= columnHeight && needed > remaining(block)) {
        advance();
      }
    }

    if (!block.split || !block.split.units.length) {
      if (block.height > columnHeight) {
        if (blockCount > 0) advance();
        place(block, undefined, block.height);
        overflowBlocks += 1;
        continue;
      }
      if (block.height > remaining(block)) {
        advance();
      }
      place(block, undefined, block.height);
      continue;
    }

    // 可拆分块：按单元（词性分组 / 条目）整体流转
    const { header, units } = block.split;
    let unitIndex = 0;
    while (unitIndex < units.length) {
      const avail = remaining(block);
      let fits = 0;
      let usedH = header;
      while (unitIndex + fits < units.length) {
        const nextH = units[unitIndex + fits].h;
        if (usedH + nextH > avail) break;
        usedH += nextH;
        fits += 1;
      }
      if (fits === 0) {
        const singleFits = header + units[unitIndex].h;
        if (blockCount === 0) {
          // 空列仍放不下（单元超过整列）→ 强行放置，渲染端裁剪
          const u = units[unitIndex];
          place(block, [u.from, u.to], singleFits);
          overflowBlocks += 1;
          unitIndex += 1;
          continue;
        }
        advance();
        continue;
      }
      const end = unitIndex + fits;
      const isFull = unitIndex === 0 && end === units.length;
      const from = units[unitIndex].from;
      const to = units[end - 1].to;
      place(block, isFull ? undefined : [from, to], usedH);
      unitIndex = end;
    }
  }

  // 去掉尾部空页
  while (pages.length > 1 && pages[pages.length - 1].slots.every((s) => s.length === 0)) {
    pages.pop();
  }

  // 续页标记：同一词条的后续页面首个块加「续」
  for (const page of pages) {
    const seen = new Set<string>();
    for (const slotBlocks of page.slots) {
      for (const b of slotBlocks) {
        const first = entryFirstPage[b.entryId];
        if (first !== undefined && first < page.index && !seen.has(b.entryId)) {
          b.continued = true;
        }
        seen.add(b.entryId);
      }
    }
  }

  return { pages, entryFirstPage, overflowBlocks };
}

/** 网格（闪卡）模式：按每页固定词条数切块 */
export function paginateGrid<T>(items: T[], perPage: number): T[][] {
  const n = Math.max(1, perPage);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
