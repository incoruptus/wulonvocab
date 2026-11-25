"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "@/lib/utils";
import {
  DEFAULT_VIEW_PREFS,
  loadBookViewState,
  saveBookViewState,
  type BookViewState,
  type SavedView,
  type ViewPrefs,
} from "@/lib/viewPrefs";

function freshState(): BookViewState {
  return { prefs: { ...DEFAULT_VIEW_PREFS, collapsed: [] }, savedViews: [] };
}

/** 词条列表视图偏好：独立 IDB，异步水合；不在主 store / history / sync 中。 */
export function useBookViewPrefs(bookId: string) {
  const [state, setState] = useState<BookViewState>(freshState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    let alive = true;
    void loadBookViewState(bookId).then((loaded) => {
      if (!alive) return;
      stateRef.current = loaded;
      setState(loaded);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [bookId]);

  const commit = useCallback(
    (next: BookViewState) => {
      stateRef.current = next;
      setState(next);
      void saveBookViewState(bookId, next).catch((error) => {
        console.error("[wulonvocab] 视图偏好写入失败：", error);
      });
    },
    [bookId],
  );

  const updatePrefs = useCallback(
    (patch: Partial<ViewPrefs>) => {
      if (!ready) return;
      commit({ ...stateRef.current, prefs: { ...stateRef.current.prefs, ...patch } });
    },
    [commit, ready],
  );

  const toggleCollapsed = useCallback(
    (key: string) => {
      if (!ready) return;
      const collapsed = stateRef.current.prefs.collapsed;
      updatePrefs({ collapsed: collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key] });
    },
    [ready, updatePrefs],
  );

  const saveView = useCallback(
    (name: string) => {
      if (!ready) return;
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const view: SavedView = { id: uid(), name: trimmed, prefs: { ...stateRef.current.prefs, collapsed: [] } };
      commit({ ...stateRef.current, savedViews: [...stateRef.current.savedViews, view].slice(-20) });
    },
    [commit, ready],
  );

  const applyView = useCallback(
    (id: string) => {
      if (!ready) return;
      const view = stateRef.current.savedViews.find((item) => item.id === id);
      if (view) commit({ ...stateRef.current, prefs: { ...view.prefs, collapsed: [] } });
    },
    [commit, ready],
  );

  const deleteView = useCallback(
    (id: string) => {
      if (!ready) return;
      commit({ ...stateRef.current, savedViews: stateRef.current.savedViews.filter((item) => item.id !== id) });
    },
    [commit, ready],
  );

  return { state, ready, updatePrefs, toggleCollapsed, saveView, applyView, deleteView };
}
