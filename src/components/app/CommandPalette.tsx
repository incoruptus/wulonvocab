"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useHistoryStore } from "@/lib/history";
import { buildCommands, filterCommands, type PaletteCommand } from "@/lib/commandPalette";
import { Kbd, KbdGroup } from "@/components/ui/misc";
import { cx } from "@/lib/utils";

/**
 * 命令面板（Ctrl/⌘+K，全局唯一键）
 * ------------------------------------------------------------
 * 导航 / 最近词库 / 动作（新建、开始学习、导出）/ 主题，一处直达；
 * 键位提示遵循约定（桌面门控入口在 TopNav，面板内底部键帽说明）。
 */
export function CommandPalette() {
  const router = useRouter();
  const books = useAppStore((s) => s.books);
  const lastBookId = useAppStore((s) => s.settings.lastBookId);
  const setSettings = useAppStore((s) => s.setSettings);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo(
    () =>
      buildCommands({
        books: books.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })),
        lastBookId,
        canUndo,
        canRedo,
      }),
    [books, lastBookId, canUndo, canRedo],
  );
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { cmd: PaletteCommand; idx: number }[]>();
    filtered.forEach((cmd, idx) => {
      if (!map.has(cmd.group)) {
        map.set(cmd.group, []);
        order.push(cmd.group);
      }
      map.get(cmd.group)!.push({ cmd, idx });
    });
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  const reset = useCallback(() => {
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => {
          if (!v) reset();
          return !v;
        });
      }
    };
    const onOpen = () => {
      reset();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wv:open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wv:open-command-palette", onOpen);
    };
  }, [reset]);

  useEffect(() => {
    if (!open) return;
    document.querySelector('[data-cmd-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const exec = useCallback(
    (cmd: PaletteCommand) => {
      setOpen(false);
      if (cmd.run.kind === "navigate") router.push(cmd.run.href);
      else if (cmd.run.kind === "theme") setSettings({ theme: cmd.run.theme });
      else {
        const store = useAppStore.getState();
        if (cmd.run.op === "undo") store.undoHistory();
        else store.redoHistory();
      }
    },
    [router, setSettings],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="w-full max-w-lg overflow-hidden rounded-xl bg-background-100 shadow-geist-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-300 px-3.5">
          <Search className="size-4 shrink-0 text-gray-700" />
          <input
            autoFocus
            data-native-undo
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = filtered[active];
                if (cmd) exec(cmd);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="输入命令或词库名…"
            aria-label="命令筛选"
            className="h-11 w-full bg-transparent text-[14px] text-gray-1000 outline-none placeholder:text-gray-700"
          />
        </div>

        <div role="listbox" aria-label="命令列表" className="scroll-thin max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-6 text-center t-label-13 text-gray-700">没有匹配的命令</div>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group}>
                <div className="px-3.5 pb-1 pt-2 t-label-12 text-gray-700">{group}</div>
                {items.map(({ cmd, idx }) => (
                  <button
                    key={cmd.id}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    data-cmd-active={idx === active || undefined}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => exec(cmd)}
                    className={cx(
                      "flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-gray-1000 transition-colors",
                      idx === active ? "bg-gray-100" : "hover:bg-gray-100",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                    {cmd.hint ? <span className="t-label-12 shrink-0 text-gray-700">{cmd.hint}</span> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-300 px-3.5 py-2 t-label-12 text-gray-700">
          <span className="inline-flex items-center gap-1">
            <KbdGroup keys={["↑", "↓"]} /> 选择
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd> 执行
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> 关闭
          </span>
          <span className="ml-auto t-mono-12">Ctrl / ⌘ + K</span>
        </div>
      </div>
    </div>
  );
}
