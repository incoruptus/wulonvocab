/**
 * 命令面板 · 纯逻辑层
 * ------------------------------------------------------------
 * buildCommands：把「导航 / 最近词库 / 动作 / 主题」编译为命令列表（纯函数，可单测）；
 * filterCommands：轻量匹配（大小写不敏感、空格分词、全包含）。
 * 执行的副作用全部留在组件层（router / store）。
 */

export interface PaletteBookRef {
  id: string;
  name: string;
  updatedAt: number;
}

export type PaletteRun =
  | { kind: "navigate"; href: string }
  | { kind: "theme"; theme: "light" | "dark" | "system" }
  | { kind: "history"; op: "undo" | "redo" };

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  /** 右侧提示（键位 / 类别） */
  hint?: string;
  /** 过滤用（小写；可含拼音缩写等补充词） */
  keywords: string;
  run: PaletteRun;
}

export function buildCommands(input: {
  books: PaletteBookRef[];
  lastBookId: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
}): PaletteCommand[] {
  const { books, lastBookId, canUndo = false, canRedo = false } = input;
  const lastBook = books.find((b) => b.id === lastBookId) ?? null;
  const recent = [...books].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  const commands: PaletteCommand[] = [
    // 导航
    { id: "go-learn", group: "导航", label: "学习中心", hint: "今日复习", keywords: "xuexi xuexizhongxin learn study fuxi", run: { kind: "navigate", href: "/learn" } },
    { id: "go-books", group: "导航", label: "词库列表", keywords: "ciku books list cidian", run: { kind: "navigate", href: "/books" } },
    { id: "go-import", group: "导航", label: "导入词表", keywords: "daoru import json csv", run: { kind: "navigate", href: "/import" } },
    { id: "go-skill", group: "导航", label: "AI Skill 规范", keywords: "ai skill guifan", run: { kind: "navigate", href: "/skill" } },
    { id: "go-settings", group: "导航", label: "设置", keywords: "shezhi settings", run: { kind: "navigate", href: "/settings" } },

    // 动作
    ...(canUndo
      ? [
          {
            id: "act-undo",
            group: "动作",
            label: "撤销上一步",
            hint: "Ctrl+Z",
            keywords: "chexiao undo huifu",
            run: { kind: "history" as const, op: "undo" as const },
          },
        ]
      : []),
    ...(canRedo
      ? [
          {
            id: "act-redo",
            group: "动作",
            label: "重做",
            hint: "Ctrl+Shift+Z",
            keywords: "chongzuo redo",
            run: { kind: "history" as const, op: "redo" as const },
          },
        ]
      : []),
    { id: "act-new-book", group: "动作", label: "新建词库", keywords: "xinjian ciku new", run: { kind: "navigate", href: "/books?new=1" } },
    lastBook
      ? {
          id: "act-start-study",
          group: "动作",
          label: `开始学习「${lastBook.name}」`,
          hint: "上次的词库",
          keywords: "kaishi xuexi start study",
          run: { kind: "navigate", href: `/study?id=${lastBook.id}` },
        }
      : {
          id: "act-start-study",
          group: "动作",
          label: "开始学习（先建一个词库）",
          keywords: "kaishi xuexi start study",
          run: { kind: "navigate", href: "/books?new=1" },
        },
    ...(lastBook
      ? [
          {
            id: "act-export",
            group: "动作",
            label: `导出「${lastBook.name}」`,
            hint: "导出工作室",
            keywords: "daochu daoyin export pdf png",
            run: { kind: "navigate" as const, href: `/book/export?id=${lastBook.id}` },
          },
        ]
      : []),
    { id: "act-open-book", group: "动作", label: "打开上次的词库", keywords: "dakai ciku open", run: { kind: "navigate", href: lastBook ? `/book?id=${lastBook.id}` : "/books" } },

    // 主题
    { id: "theme-light", group: "主题", label: "浅色模式", keywords: "qianse light zhuti theme", run: { kind: "theme", theme: "light" } },
    { id: "theme-dark", group: "主题", label: "深色模式", keywords: "shense dark zhuti theme", run: { kind: "theme", theme: "dark" } },
    { id: "theme-system", group: "主题", label: "跟随系统", keywords: "gensui xitong system zhuti theme", run: { kind: "theme", theme: "system" } },
  ];

  // 最近词库（放导航之后、动作之前直观出现）
  const bookCommands: PaletteCommand[] = recent.map((b) => ({
    id: `book-${b.id}`,
    group: "最近词库",
    label: `打开「${b.name}」`,
    keywords: `ciku book ${b.name.toLowerCase()}`,
    run: { kind: "navigate", href: `/book?id=${b.id}` },
  }));

  const nav = commands.filter((c) => c.group === "导航");
  const rest = commands.filter((c) => c.group !== "导航");
  return [...nav, ...bookCommands, ...rest];
}

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const tokens = q.split(/\s+/);
  return commands.filter((c) => {
    const hay = `${c.label} ${c.keywords}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
