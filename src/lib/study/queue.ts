import type { Entry, Wordbook } from "../types";
import { isDue, isMastered, isNewSrs } from "./engine";
import { DEFAULT_STUDY_CONFIG, emptyDailyLog, ymd, type BookStudy, type StudyConfig, type StudyDailyLog } from "./types";

/** 取（或补默认）学习配置视图，不写库 */
export function studyOf(book: Wordbook): BookStudy {
  return book.study ?? { config: { ...DEFAULT_STUDY_CONFIG }, daily: {} };
}

export function studyConfigOf(book: Wordbook): StudyConfig {
  return { ...DEFAULT_STUDY_CONFIG, ...(book.study?.config ?? {}) };
}

export function dailyLogOf(book: Wordbook, now = Date.now()): StudyDailyLog {
  return book.study?.daily[ymd(now)] ?? emptyDailyLog();
}

export interface StudyOverview {
  /** 今日待复习（非新卡且已到期） */
  due: number;
  /** 今日剩余可学新词 */
  newRemaining: number;
  /** 已引入（在学 + 复习中） */
  learning: number;
  /** 已掌握 */
  mastered: number;
  /** 最早到期时间（用于「下次复习」提示） */
  nextDue?: number;
}

export function studyOverview(book: Wordbook, now = Date.now()): StudyOverview {
  const cfg = studyConfigOf(book);
  const daily = dailyLogOf(book, now);
  let due = 0;
  let learning = 0;
  let mastered = 0;
  let nextDue: number | undefined;
  for (const e of book.entries) {
    if (isNewSrs(e.srs)) continue;
    if (isMastered(e.srs)) mastered += 1;
    else learning += 1;
    if (isDue(e.srs, now)) due += 1;
    else if (e.srs && (nextDue === undefined || e.srs.due < nextDue)) nextDue = e.srs.due;
  }
  return {
    due,
    newRemaining: Math.max(0, cfg.newPerDay - daily.added),
    learning,
    mastered,
    nextDue,
  };
}

export type StudyMode = "mixed" | "review" | "new";

export interface QueueItem {
  entryId: string;
  isNew: boolean;
}

export function buildQueue(book: Wordbook, mode: StudyMode, now = Date.now()): QueueItem[] {
  const cfg = studyConfigOf(book);
  const daily = dailyLogOf(book, now);
  const items: QueueItem[] = [];

  if (mode !== "new") {
    const reviewRemaining = Math.max(0, cfg.reviewPerDay - daily.reviewed);
    const dueEntries = book.entries
      .filter((e) => isDue(e.srs, now))
      .sort((a, b) => (a.srs!.due ?? 0) - (b.srs!.due ?? 0))
      .slice(0, reviewRemaining);
    for (const e of dueEntries) items.push({ entryId: e.id, isNew: false });
  }
  if (mode !== "review") {
    const remaining = Math.max(0, cfg.newPerDay - daily.added);
    const newEntries = book.entries.filter((e) => isNewSrs(e.srs)).slice(0, remaining);
    for (const e of newEntries) items.push({ entryId: e.id, isNew: true });
  }
  return items;
}

export function entryById(book: Wordbook, id: string): Entry | undefined {
  return book.entries.find((e) => e.id === id);
}
