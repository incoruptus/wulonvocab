"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VIEW_PREFS,
  loadBookViewState,
  saveBookViewState,
  type SavedView,
  type ViewPrefs,
} from "@/lib/viewPrefs";
import { useAppStore } from "@/lib/store";

const EMPTY_SAVED_VIEWS: SavedView[] = [];

/** 临时排序筛选留本机；命名保存视图作为词库用户数据随同步。 */
export function useBookViewPrefs(bookId: string) {
  const [prefs, setPrefs] = useState<ViewPrefs>({ ...DEFAULT_VIEW_PREFS, collapsed: [] });
  const [ready, setReady] = useState(false);
  const prefsRef = useRef(prefs);
  const savedViews = useAppStore((state) => state.books.find((book) => book.id === bookId)?.savedViews ?? EMPTY_SAVED_VIEWS);
  const saveBookView = useAppStore((state) => state.saveBookView);
  const deleteBookView = useAppStore((state) => state.deleteBookView);
  const importLegacySavedViews = useAppStore((state) => state.importLegacySavedViews);

  useEffect(() => {
    let alive = true;
    void loadBookViewState(bookId).then((loaded) => {
      if (!alive) return;
      prefsRef.current = loaded.prefs;
      setPrefs(loaded.prefs);
      setReady(true);
      if (loaded.savedViews.length) {
        importLegacySavedViews(bookId, loaded.savedViews);
        void saveBookViewState(bookId, { prefs: loaded.prefs, savedViews: [] });
      }
    });
    return () => {
      alive = false;
    };
  }, [bookId, importLegacySavedViews]);

  const updatePrefs = useCallback(
    (patch: Partial<ViewPrefs>) => {
      if (!ready) return;
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      void saveBookViewState(bookId, { prefs: next, savedViews: [] }).catch((error) => {
        console.error("[wulonvocab] 视图偏好写入失败：", error);
      });
    },
    [bookId, ready],
  );

  const toggleCollapsed = useCallback(
    (key: string) => {
      if (!ready) return;
      const collapsed = prefsRef.current.collapsed;
      updatePrefs({ collapsed: collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key] });
    },
    [ready, updatePrefs],
  );

  const saveView = useCallback(
    (name: string) => {
      if (!ready) return;
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      saveBookView(bookId, trimmed, prefsRef.current);
    },
    [bookId, ready, saveBookView],
  );

  const applyView = useCallback(
    (id: string) => {
      if (!ready) return;
      const view = savedViews.find((item) => item.id === id);
      if (view) updatePrefs({ ...view.prefs, collapsed: [] });
    },
    [ready, savedViews, updatePrefs],
  );

  const deleteView = useCallback(
    (id: string) => {
      if (!ready) return;
      deleteBookView(bookId, id);
    },
    [bookId, ready, deleteBookView],
  );

  return { state: { prefs, savedViews }, ready, updatePrefs, toggleCollapsed, saveView, applyView, deleteView };
}
