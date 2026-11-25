"use client";

import { useEffect, useState } from "react";
import { buildMasteryIndex, type MasteryIndex } from "@/lib/study/mastery";
import { listReviewLog } from "@/lib/study/reviewLog";

/** 本机复习日志的只读派生索引；日志写入或清空后自动刷新。 */
export function useReviewMastery(): { index: MasteryIndex; ready: boolean } {
  const [index, setIndex] = useState<MasteryIndex>(() => new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      const events = await listReviewLog();
      if (!active || current !== generation) return;
      setIndex(buildMasteryIndex(events));
      setReady(true);
    };
    void load();
    window.addEventListener("wulonvocab:review-log-updated", load);
    return () => {
      active = false;
      generation += 1;
      window.removeEventListener("wulonvocab:review-log-updated", load);
    };
  }, []);

  return { index, ready };
}
