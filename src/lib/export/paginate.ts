/**
 * 确定性分页：把「已测高度的内容块」分配到固定尺寸的页面 / 分栏。
 * 纯函数、无 DOM 依赖，便于单元测试。
 *
 * 高度模型（px）：
 * - 同列相邻块之间固定 gap；
 * - 可拆分块（senses / examples / list ...）记录 `split = { header, units[] }`，
 *   内容超高时按「条目」拆分到下一列 / 下一页，续块重复小节标题并带「续」标记；
 * - 义项块支持细粒度单元（cells）：核心释义与例句扩展可分段续排；
 * - `glueWithNext`（词条头部）保证头部与首个内容块不分离（孤行控制）。
 */

import type { SenseCell } from "../sections";

export interface MeasuredUnit {
  from: number;
  to: number;
  h: number;
  /** 义项细粒度单元：本单元对应的 cell（核心/扩展） */
  cells?: SenseCell[];
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
  /** 义项细粒度切片（优先于 slice 渲染） */
  cells?: SenseCell[];
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
  /**
   * 分页模式：
   * - align：题头与页首对齐（词条起始段放不下时整段移到新页/新栏开头）
   * - continuous：连续填充（尽量占满每页，仅在整块装不下时按单元续排）
   */
  mode?: "align" | "continuous";
  /** 小字段整块保护：高度 ≤ 该值的可拆分块不切分，整块移动（默认 35% 栏高） */
  atomicMax?: number;
}

export function paginate(blocks: MeasuredBlock[], options: PaginateOptions): PaginationResult {
  const columns = Math.max(1, options.columns);
  const columnHeight = Math.max(1, options.columnHeight);
  const defaultGap = options.gap ?? 0;
  const mode = options.mode ?? "align";
  const atomicMax = options.atomicMax ?? columnHeight * 0.35;

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

  const place = (
    block: MeasuredBlock,
    slice: [number, number] | undefined,
    height: number,
    cells?: SenseCell[],
  ) => {
    const planned: PlannedBlock = {
      id: block.id,
      entryId: block.entryId,
      kind: block.kind,
      sectionId: block.sectionId,
      slice,
      cells,
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

  /**
   * 词条总高：题头 + 该词条全部内容块（可拆分块用真实整块高度）。
   * 题头模式据此判断「整词能否放进当前剩余空间」——放不下就把题头移到页/栏开头。
   */
  const entryTotalHeight = (i: number): number => {
    const entryId = blocks[i].entryId;
    let h = blocks[i].height;
    for (let j = i + 1; j < blocks.length && blocks[j].entryId === entryId; j += 1) {
      h += gapFor(blocks[j]) + blocks[j].height;
    }
    return h;
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    // 题头模式：整词放不进当前剩余空间 → 题头移到下一列/页开头
    // 连续模式：仅保证题头后至少跟一块（避免题头孤零零停在页脚）
    if (block.glueWithNext && blockCount > 0) {
      let needed: number;
      if (mode === "align") {
        needed = entryTotalHeight(i);
      } else {
        const next = i + 1 < blocks.length ? blocks[i + 1] : null;
        needed = block.height + (next ? gapFor(next) + firstUnitHeight(next) : 0);
      }
      if (needed > remaining(block)) {
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

    // 可拆分块：优先「整块放下」——横向换行内容（标签/词形变化等）整块高度
    // 远小于「单元累加高度」，必须以真实整块高度判断能否放下，否则会误判为放不下
    const { header, units } = block.split;
    if (block.height <= remaining(block)) {
      place(block, undefined, block.height);
      continue;
    }
    // 小字段整块保护：矮块即便放不下也不切分，整块移到下一列后重试放置
    if (block.height <= atomicMax) {
      if (block.height > remaining(block) && blockCount > 0) {
        advance();
      }
      place(block, undefined, block.height);
      continue;
    }

    // 按单元切分续排
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
          place(block, [u.from, u.to], singleFits, u.cells);
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
      const pieceCells =
        !isFull && units[unitIndex].cells ? units.slice(unitIndex, end).flatMap((u) => u.cells ?? []) : undefined;
      place(block, isFull ? undefined : [from, to], usedH, pieceCells);
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
