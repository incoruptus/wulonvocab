"use client";

import { useEffect, useState } from "react";
import { effectiveReviewEvents, listReviewLog } from "@/lib/study/reviewLog";

export type WeakEvidenceMap = ReadonlyMap<string, { recentAgain?: boolean; slowSuccess?: boolean; lastRating?: number }>;

const EMPTY: WeakEvidenceMap = new Map();

/** 本机日志只提供排序线索；读取失败时退回 SRS 状态，不阻塞学习。 */
export function useWeakEvidence(): WeakEvidenceMap {
  const [evidence, setEvidence] = useState<WeakEvidenceMap>(EMPTY);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void listReviewLog().then((raw) => {
        if (!alive) return;
        const now = Date.now();
        const latest = new Map<string, { rating?: number; againAt?: number; slowAt?: number }>();
        for (const event of effectiveReviewEvents(raw)) {
          if (!event.entryId || !event.rating || event.newCard) continue;
          const current = latest.get(event.entryId) ?? {};
          if (event.rating === 1) current.againAt = Math.max(current.againAt ?? 0, event.at);
          if (event.rating !== 1 && event.elapsedMs !== undefined && event.elapsedMs >= 20000 && event.elapsedMs <= 60000) {
            current.slowAt = Math.max(current.slowAt ?? 0, event.at);
          }
          current.rating = event.rating;
          latest.set(event.entryId, current);
        }
        setEvidence(new Map([...latest].map(([entryId, value]) => [entryId, {
          recentAgain: value.againAt !== undefined && now - value.againAt <= 7 * 86400000,
          slowSuccess: value.slowAt !== undefined && now - value.slowAt <= 7 * 86400000,
          lastRating: value.rating,
        }])));
      });
    };
    load();
    window.addEventListener("wulonvocab:review-log-updated", load);
    return () => {
      alive = false;
      window.removeEventListener("wulonvocab:review-log-updated", load);
    };
  }, []);

  return evidence;
}
