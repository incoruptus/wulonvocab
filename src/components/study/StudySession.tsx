"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestSyncNow } from "@/lib/sync/auto";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, CalendarClock, ChevronLeft, Keyboard, RotateCcw, Sparkles, Undo2, Volume2, X } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import {
  formatInterval,
  isNewSrs,
  needsSessionRequeue,
  previewGrades,
  type GradePreview,
  type GradeValue,
} from "@/lib/study/engine";
import { buildQueue, entryById, studyConfigOf, studyOverview, type QueueItem, type StudyMode, type StudyOverview } from "@/lib/study/queue";
import { buildQuizOptions, type QuizQuestion } from "@/lib/study/quiz";
import { CHOICE_OPTION_KEYS, KEYMAP_CHOICE, KEYMAP_COMMON, KEYMAP_FLIP, type KeyBinding } from "@/lib/study/keymap";
import type { StudyConfig, StudySrs } from "@/lib/study/types";
import { speakWord } from "@/lib/study/tts";
import { Button, IconButton } from "@/components/ui/button";
import { Card, Kbd, KbdGroup, SegmentedControl } from "@/components/ui/misc";
import { Slider, SwitchRow } from "@/components/ui/field";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { StudyCard } from "@/components/study/StudyCard";
import { ChoiceCard } from "@/components/study/ChoiceCard";
import { cx } from "@/lib/utils";

type Phase = "home" | "session" | "summary";

interface SessionStats {
  answered: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  startedAt: number;
  endedAt?: number;
}

const EMPTY_STATS: SessionStats = { answered: 0, again: 0, hard: 0, good: 0, easy: 0, startedAt: 0 };

const GRADE_STYLE: Record<GradeValue, string> = {
  1: "bg-red-700/12 text-red-900 hover:bg-red-700/20",
  2: "bg-amber-700/15 text-amber-900 hover:bg-amber-700/25",
  3: "bg-green-800/12 text-green-900 hover:bg-green-800/20",
  4: "bg-gray-100 text-gray-1000 hover:bg-gray-200",
};

const GRADE_LABEL: Record<GradeValue, string> = { 1: "忘记", 2: "模糊", 3: "记得", 4: "轻松" };
/** 桌面键位：D F（左手）/ J K（右手）与空格同排，符合人体工学 */
const GRADE_KEY: Record<GradeValue, string> = { 1: "D", 2: "F", 3: "J", 4: "K" };
const KEY_TO_GRADE: Record<string, GradeValue> = { d: 1, f: 2, j: 3, k: 4, "1": 1, "2": 2, "3": 3, "4": 4 };

function pronLang(entry: Entry): "en-GB" | "en-US" {
  const p = (entry.values["phonetic"] ?? {}) as { uk?: string };
  return p.uk ? "en-GB" : "en-US";
}

export function StudySession({ book }: { book: Wordbook }) {
  const router = useRouter();
  const applyReview = useAppStore((s) => s.applyReview);
  const undoReview = useAppStore((s) => s.undoReview);
  const setStudyConfig = useAppStore((s) => s.setStudyConfig);

  // 开始学习之前：拉一轮最新进度（静默；未配置自动同步时无感）
  useEffect(() => {
    requestSyncNow({ silent: true });
  }, []);
  const toggleStar = useAppStore((s) => s.toggleStar);

  const [phase, setPhase] = useState<Phase>("home");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [totalPlanned, setTotalPlanned] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [previews, setPreviews] = useState<GradePreview[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [undo, setUndo] = useState<{ entryId: string; before?: StudySrs; rating: GradeValue; elapsedMs: number; isNew: boolean; dayKey?: string } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [overview, setOverview] = useState<StudyOverview & { nextDueLabel: string }>({
    due: 0,
    newRemaining: 0,
    learning: 0,
    mastered: 0,
    nextDueLabel: "—",
  });
  const cardStartRef = useRef(0);
  /** 预览与评分共享的复习时刻（保证 fuzz 播放一致） */
  const reviewNowRef = useRef(0);
  /** 已提交但尚未推进队列的评分（选择题反馈期间） */
  const gradedRef = useRef<{ entryId: string; isNew: boolean; next: StudySrs } | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 答题后的输入锁定（防连发/误触），值为解锁时间戳 */
  const inputLockRef = useRef(0);

  // 选择题模式状态
  const [chosen, setChosen] = useState<number | null>(null);
  const [judged, setJudged] = useState(false);
  /** 本次会话跳过的词（未作答，F 返回用；上限 50 条） */
  const skippedRef = useRef<QueueItem[]>([]);
  /** 快捷键帮助弹窗 */
  const [helpOpen, setHelpOpen] = useState(false);
  /** 正确项位置洗牌袋（每答一题轮换；用 ref 以免触发题目重建） */
  const posBagRef = useRef<number[]>([0, 1, 2, 3]);
  /** 当前卡片的题目（卡片切换时重建；作答后冻结，防止选项重排） */
  const [question, setQuestion] = useState<QuizQuestion | null>(null);

  const cfg = studyConfigOf(book);
  const current = useMemo(() => (queue.length ? entryById(book, queue[0].entryId) : undefined), [book, queue]);

  // 选择题题目（干扰项不足时返回 null → 该卡回退翻卡模式）
  // 冻结策略：仅在「卡片切换 / 模式切换」时重建；词池取切换瞬间的 store 快照，
  // 避免评分更新 book.entries 触发重建导致选项重排（正确项漂移）。
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (cfg.quizMode !== "choice" || !current) {
        setQuestion(null);
        return;
      }
      const entries = useAppStore.getState().books.find((b) => b.id === book.id)?.entries ?? book.entries;
      setQuestion(buildQuizOptions(current, entries, { forceCorrectIndex: posBagRef.current[0] }));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.quizMode, current?.id, book.id]);
  const effectiveMode: "flip" | "choice" = cfg.quizMode === "choice" && question ? "choice" : "flip";

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearAutoTimer, [clearAutoTimer]);

  // 概览统计（在 effect 中读取时间，避免渲染期副作用）
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const now = Date.now();
      const ov = studyOverview(book, now);
      setOverview({ ...ov, nextDueLabel: ov.nextDue ? formatInterval(ov.nextDue - now) : "—" });
    });
    return () => cancelAnimationFrame(raf);
  }, [book, phase]);

  // 会话中词条被删除时跳过
  useEffect(() => {
    if (phase === "session" && queue.length > 0 && !current) {
      const raf = requestAnimationFrame(() => setQueue((q) => q.slice(1)));
      return () => cancelAnimationFrame(raf);
    }
    return;
  }, [phase, queue.length, current]);

  const onReveal = useCallback(() => {
    if (!current) return;
    const now = Date.now();
    reviewNowRef.current = now;
    setRevealed(true);
    setPreviews(previewGrades(current.srs, cfg.retention, now));
    cardStartRef.current = now;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* iOS 无振动 API */
    }
    if (cfg.autoSpeak) speakWord(current.headword, pronLang(current));
  }, [current, cfg.retention, cfg.autoSpeak]);

  const startSession = useCallback(
    (mode: StudyMode) => {
      const items = buildQueue(useAppStore.getState().books.find((b) => b.id === book.id) ?? book, mode, Date.now());
      if (!items.length) {
        toast.info(mode === "new" ? "今日新词已学完" : "今天没有要复习的词");
        return;
      }
      setQueue(items);
      setTotalPlanned(items.length);
      setStats({ ...EMPTY_STATS, startedAt: Date.now() });
      setUndo(null);
      gradedRef.current = null;
      clearAutoTimer();
      setRevealed(false);
      setPreviews([]);
      setChosen(null);
      setJudged(false);
      skippedRef.current = [];
      cardStartRef.current = Date.now();
      setPhase("session");
      const first = entryById(book, items[0].entryId);
      if (cfg.autoSpeak && first) speakWord(first.headword, pronLang(first));
    },
    [book, cfg.autoSpeak, clearAutoTimer],
  );

  /** 提交评分（写库 + 统计 + 记撤销快照），不含队列推进 */
  const commitGrade = useCallback(
    (rating: GradeValue) => {
      if (!current) return false;
      try {
        navigator.vibrate?.(rating === 1 ? 20 : 10);
      } catch {
        /* iOS 不支持，静默降级 */
      }
      const elapsed = Math.max(0, Date.now() - cardStartRef.current);
      const res = applyReview(book.id, current.id, rating, elapsed, reviewNowRef.current || Date.now());
      if (!res) return false;
      setStats((st) => ({
        ...st,
        answered: st.answered + 1,
        again: st.again + (rating === 1 ? 1 : 0),
        hard: st.hard + (rating === 2 ? 1 : 0),
        good: st.good + (rating === 3 ? 1 : 0),
        easy: st.easy + (rating === 4 ? 1 : 0),
      }));
      setUndo({ entryId: current.id, before: res.before, rating, elapsedMs: elapsed, isNew: isNewSrs(res.before), dayKey: res.dayKey });
      gradedRef.current = { entryId: current.id, isNew: isNewSrs(res.before), next: res.next };
      inputLockRef.current = Date.now() + 180;
      return true;
    },
    [book.id, current, applyReview],
  );

  /** 推进队列（含学习步回炉） */
  const advanceCard = useCallback(() => {
    const graded = gradedRef.current;
    if (!graded) return;
    gradedRef.current = null;
    clearAutoTimer();
    // 已评分的词不再参与 F 返回
    skippedRef.current = skippedRef.current.filter((x) => x.entryId !== graded.entryId);
    const rest = queue.slice(1);
    if (needsSessionRequeue(graded.next, Date.now())) {
      rest.splice(Math.min(rest.length, 4), 0, { entryId: graded.entryId, isNew: false });
    }
    setQueue(rest);
    setRevealed(false);
    setPreviews([]);
    setChosen(null);
    setJudged(false);
    if (rest.length === 0) {
      setStats((st) => ({ ...st, endedAt: Date.now() }));
      setPhase("summary");
    } else {
      const next = entryById(book, rest[0].entryId);
      if (cfg.autoSpeak && next) speakWord(next.headword, pronLang(next));
      cardStartRef.current = Date.now();
    }
  }, [queue, book, cfg.autoSpeak, clearAutoTimer]);

  /**
   * 选择题词间导航（可不作答自由浏览）：
   * dir=1 跳过当前词（本轮稍后再次出现）；dir=-1 回到最近跳过的词。
   * 仅移动队列位置，不写评分、不影响统计。
   */
  const navigateCard = useCallback(
    (dir: 1 | -1) => {
      if (!queue.length) return;
      let nextEntryId: string;
      if (dir === 1) {
        if (queue.length <= 1) {
          toast.info("已经是最后一个词了");
          return;
        }
        skippedRef.current.push(queue[0]);
        if (skippedRef.current.length > 50) skippedRef.current.shift();
        const [first, ...rest] = queue;
        setQueue([...rest, first]);
        nextEntryId = rest[0].entryId;
      } else {
        const item = skippedRef.current.pop();
        if (!item) {
          toast.info("没有可返回的词");
          return;
        }
        setQueue([item, ...queue.filter((x) => x.entryId !== item.entryId)]);
        nextEntryId = item.entryId;
      }
      clearAutoTimer();
      setRevealed(false);
      setPreviews([]);
      setChosen(null);
      setJudged(false);
      const next = entryById(book, nextEntryId);
      if (cfg.autoSpeak && next) speakWord(next.headword, pronLang(next));
      cardStartRef.current = Date.now();
    },
    [queue, book, cfg.autoSpeak, clearAutoTimer],
  );

  /** 翻卡模式评级 */
  const onGrade = useCallback(
    (rating: GradeValue) => {
      if (!current || !revealed) return;
      if (commitGrade(rating)) advanceCard();
    },
    [current, revealed, commitGrade, advanceCard],
  );

  /** 选择题作答 */
  const onChoose = useCallback(
    (index: number) => {
      if (!current || !question || judged) return;
      const correct = index === question.correctIndex;
      if (!commitGrade(correct ? 3 : 1)) return;
      setChosen(index);
      setJudged(true);
      // 洗牌袋轮换（ref 更新，不触发题目重建）
      posBagRef.current = [...posBagRef.current.slice(1), posBagRef.current[0]];
      // 答对且选择「自动」时才自动前进；答错一律停留等用户确认（给纠正编码的时间）
      if (correct && cfg.choiceAdvance === "auto") {
        clearAutoTimer();
        autoTimerRef.current = setTimeout(advanceCard, 800);
      }
    },
    [current, question, judged, commitGrade, cfg.choiceAdvance, advanceCard, clearAutoTimer],
  );

  const onUndo = useCallback(() => {
    if (!undo || phase !== "session") return;
    clearAutoTimer();
    undoReview(book.id, undo.entryId, undo.before, undo.rating, undo.elapsedMs, undo.dayKey);
    setStats((st) => ({
      ...st,
      answered: Math.max(0, st.answered - 1),
      again: st.again - (undo.rating === 1 ? 1 : 0),
      hard: st.hard - (undo.rating === 2 ? 1 : 0),
      good: st.good - (undo.rating === 3 ? 1 : 0),
      easy: st.easy - (undo.rating === 4 ? 1 : 0),
    }));
    setQueue((q) => [{ entryId: undo.entryId, isNew: undo.isNew }, ...q.filter((x) => x.entryId !== undo.entryId)]);
    gradedRef.current = null;
    setUndo(null);
    setChosen(null);
    setJudged(false);
    const now = Date.now();
    reviewNowRef.current = now;
    if (effectiveMode === "flip") {
      setRevealed(true);
      setPreviews(previewGrades(undo.before, cfg.retention, now));
    } else {
      setRevealed(false);
    }
    cardStartRef.current = now;
  }, [undo, phase, book, undoReview, cfg.retention, effectiveMode, clearAutoTimer]);

  const requestExit = useCallback(() => {
    clearAutoTimer();
    if (phase !== "session") {
      router.push(`/book?id=${book.id}`);
      return;
    }
    if (stats.answered > 0) setConfirmExit(true);
    else router.push(`/book?id=${book.id}`);
  }, [phase, stats.answered, router, book.id, clearAutoTimer]);

  // 拦截浏览器返回键：学习会话中先弹确认，防止误退丢进度
  useEffect(() => {
    if (phase !== "session") return;
    window.history.pushState({ wvStudy: true }, "");
    const onPop = () => {
      requestExit();
      window.history.pushState({ wvStudy: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [phase, requestExit]);

  // 键盘：翻卡（空格/DFJK/1-4）；选择题（W/E/I/O 直选、F/J 上/下一个词）；通用（U 撤销、R 发音、? 帮助、Esc 退出）
  useEffect(() => {
    if (phase !== "session") return;
    const handler = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // 弹窗打开时交给弹窗自身处理（Esc 关闭由 Radix 负责）
      if (helpOpen || confirmExit) return;
      // Radix 弹窗处理过的按键已 preventDefault（如关闭弹窗的 Esc），不重复处理
      if (ev.defaultPrevented) return;
      // 防误触：忽略连发按键与带修饰键的输入
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        requestExit();
        return;
      }
      if (ev.key === "?") {
        ev.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (ev.key === "u" || ev.key === "U") {
        ev.preventDefault();
        onUndo();
        return;
      }
      if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        if (current) speakWord(current.headword, pronLang(current));
        return;
      }
      if (ev.key === "s" || ev.key === "S") {
        ev.preventDefault();
        if (current) {
          toggleStar(book.id, current.id);
          try {
            navigator.vibrate?.(8);
          } catch {
            /* iOS 无振动 API */
          }
        }
        return;
      }

      if (effectiveMode === "choice" && question) {
        if (!judged) {
          if (Date.now() < inputLockRef.current) return;
          const k = ev.key.toLowerCase();
          const idx = (CHOICE_OPTION_KEYS as readonly string[]).indexOf(k);
          if (idx >= 0 && idx < question.options.length) {
            ev.preventDefault();
            onChoose(idx);
            return;
          }
          if (k === "f" || ev.key === "ArrowLeft") {
            ev.preventDefault();
            navigateCard(-1);
            return;
          }
          if (k === "j" || ev.key === "ArrowRight") {
            ev.preventDefault();
            navigateCard(1);
            return;
          }
        } else if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          // 与「继续」按钮的显示条件一致：答错必停留，答对时仅「按继续推进」模式需要手动
          const isCorrect = chosen !== null && chosen === question.correctIndex;
          if (!isCorrect || cfg.choiceAdvance === "continue") advanceCard();
          return;
        }
        return;
      }

      // 翻卡模式
      if (ev.key === " ") {
        ev.preventDefault();
        // Anki 习惯：未揭示 → 显示答案；已揭示 → 记为「记得」
        if (!revealed) onReveal();
        else if (Date.now() >= inputLockRef.current) onGrade(3);
        return;
      }
      if (revealed && Date.now() >= inputLockRef.current) {
        const grade = KEY_TO_GRADE[ev.key.toLowerCase()];
        if (grade) {
          ev.preventDefault();
          onGrade(grade);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, revealed, effectiveMode, question, judged, chosen, current, helpOpen, confirmExit, onReveal, onUndo, onGrade, onChoose, advanceCard, navigateCard, requestExit, cfg.choiceAdvance, toggleStar, book.id]);

  const doneCount = totalPlanned; // 计划总数（用于未来的进度文案扩展）
  void doneCount;

  /* ---------------- 渲染 ---------------- */

  if (phase === "home") {
    return (
      <HomeView
        book={book}
        cfg={cfg}
        overview={overview}
        onStart={startSession}
        onConfig={(patch) => setStudyConfig(book.id, patch)}
        onExit={() => router.push(`/book?id=${book.id}`)}
      />
    );
  }

  if (phase === "summary") {
    const duration = Math.max(0, (stats.endedAt ?? stats.startedAt) - stats.startedAt);
    return (
      <SummaryView
        book={book}
        stats={stats}
        durationMs={duration}
        onRestart={() => startSession("mixed")}
        onHome={() => setPhase("home")}
        onExit={() => router.push(`/book?id=${book.id}`)}
      />
    );
  }

  const remaining = queue.length;
  const progress = stats.answered + remaining > 0 ? stats.answered / (stats.answered + remaining) : 0;
  const choiceCorrect = question && chosen !== null ? chosen === question.correctIndex : null;

  return (
    <div className="flex h-dvh flex-col bg-background-200 touch-manipulation">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-300 bg-background-100 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <IconButton label="退出学习" onClick={requestExit}>
          <X className="size-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2">
            <span className="t-label-12 tabular-nums text-gray-800">剩余 {remaining}</span>
            <span className="text-gray-500">·</span>
            <span className="t-label-12 tabular-nums text-gray-800">已答 {stats.answered}</span>
            {undo ? (
              <button
                type="button"
                onClick={onUndo}
                className="t-label-12 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-900 hover:bg-gray-200"
              >
                <Undo2 className="size-3" /> 撤销<span className="wv-kbd-hint hidden sm:inline">（U）</span>
              </button>
            ) : null}
          </div>
          <div className="mx-auto mt-1.5 h-1 w-full max-w-md overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-blue-700 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        <span className="t-label-12 hidden w-16 truncate text-right text-gray-700 sm:block">{book.name}</span>
        <IconButton label="快捷键帮助（?）" className="wv-desktop-only hidden sm:inline-flex" onClick={() => setHelpOpen(true)}>
          <Keyboard className="size-4" />
        </IconButton>
      </header>

      {/* 卡片区 */}
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto scroll-thin">
        <div className="flex min-h-full items-start justify-center px-3 py-5 sm:items-center sm:py-8">
          {current ? (
            effectiveMode === "choice" && question ? (
              <ChoiceCard
                entry={current}
                question={question}
                judged={judged}
                chosen={chosen}
                starred={current.starred}
                onToggleStar={() => toggleStar(book.id, current.id)}
                onChoose={onChoose}
                onSkip={() => navigateCard(1)}
              />
            ) : (
              <StudyCard
                book={book}
                entry={current}
                revealed={revealed}
                onReveal={onReveal}
                starred={current.starred}
                onToggleStar={() => toggleStar(book.id, current.id)}
              />
            )
          ) : (
            <div className="t-label-13 text-gray-800">正在准备下一张卡片…</div>
          )}
        </div>
      </div>

      {/* 底部操作区（拇指自然区）：揭示前=大按钮 · 揭示后=评级 · 选择题=作答反馈 */}
      <footer role="group" aria-label="作答与评级" className="shrink-0 border-t border-gray-300 bg-background-100 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
        {effectiveMode === "choice" && question ? (
          judged ? (
            <div className="mx-auto flex max-w-xl items-center gap-2">
              <div
                role="status"
                className={cx(
                  "t-label-13 min-w-0 flex-1 rounded-lg px-3 py-2.5",
                  choiceCorrect ? "bg-green-800/10 text-green-900" : "bg-red-700/10 text-red-900",
                )}
              >
                {choiceCorrect ? (
                  <>✓ 回答正确 · 记为「记得」</>
                ) : (
                  <span className="line-clamp-2">
                    ✗ 正确答案：{"ABCD"[question.correctIndex]}. {question.options[question.correctIndex].text} · 记入「忘记」
                  </span>
                )}
              </div>
              {!choiceCorrect || cfg.choiceAdvance === "continue" ? (
                <Button size="md" className="h-11 shrink-0 gap-2 px-5" onClick={advanceCard}>
                  继续 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto flex h-12 max-w-xl items-center justify-center gap-3 text-[13px] text-gray-700">
              <span className="wv-desktop-only hidden items-center gap-1.5 sm:inline-flex">
                <KbdGroup keys={["W", "E", "I", "O"]} /> 选答案
              </span>
              <span className="wv-desktop-only hidden items-center gap-1.5 sm:inline-flex">
                <KbdGroup keys={["F", "J"]} /> 上/下一个词
              </span>
              <span className="wv-desktop-only hidden items-center gap-1.5 sm:inline-flex">
                <Kbd>S</Kbd> 星标
              </span>
              <span className="wv-touch-only items-center gap-1.5">点选选项作答 · 卡片右上角可跳过</span>
            </div>
          )
        ) : !revealed ? (
          <button
            type="button"
            onClick={onReveal}
            className="mx-auto flex h-14 w-full max-w-xl items-center justify-center gap-2 rounded-xl bg-gray-1000 text-[16px] font-medium text-background-100 transition-colors hover:bg-gray-900"
          >
            显示释义 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
          </button>
        ) : (
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            {([1, 2, 3, 4] as GradeValue[]).map((rating) => {
              const pv = previews.find((p) => p.rating === rating);
              return (
                <button
                  key={rating}
                  type="button"
                  onClick={() => onGrade(rating)}
                  className={cx(
                    "flex h-14 flex-col items-center justify-center rounded-xl transition-colors",
                    GRADE_STYLE[rating],
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[14px] font-medium">
                    {GRADE_LABEL[rating]}
                    <Kbd className="wv-desktop-only hidden h-[18px] min-w-[18px] border-gray-400/40 bg-white/50 px-1 text-[10px] shadow-none sm:inline-flex">
                      {GRADE_KEY[rating]}
                    </Kbd>
                  </span>
                  <span className="t-mono-12 opacity-75">{pv ? pv.text : "—"}</span>
                </button>
              );
            })}
          </div>
        )}
      </footer>

      {/* 退出确认 */}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogHeader title="结束本次学习？" desc={`已完成 ${stats.answered} 张卡片，进度已自动保存。`} />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmExit(false)}>
            继续学习
          </Button>
          <Button variant="error" onClick={() => router.push(`/book?id=${book.id}`)}>
            退出
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 快捷键帮助（扇贝式：功能 | 键位） */}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} mode={effectiveMode} />
    </div>
  );
}

/* ---------------- 首页 ---------------- */

function HomeView({
  book,
  cfg,
  overview,
  onStart,
  onConfig,
  onExit,
}: {
  book: Wordbook;
  cfg: StudyConfig;
  overview: StudyOverview & { nextDueLabel: string };
  onStart: (mode: StudyMode) => void;
  onConfig: (patch: Partial<StudyConfig>) => Promise<boolean> | null | void;
  onExit: () => void;
}) {
  const nothingToday = overview.due === 0 && overview.newRemaining === 0;
  const { pending: configPending, run: runConfig } = useSyncCommit();
  return (
    <div className="min-h-dvh bg-background-200">
      <div className="mx-auto w-full max-w-xl px-4 py-5 pb-10 sm:py-8">
        <div className="flex items-center gap-2">
          <IconButton label="返回词库" onClick={onExit}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <div className="min-w-0">
            <div className="t-h-16 truncate">{book.name}</div>
            <div className="t-label-12 text-gray-800">间隔重复 · 帮你安排复习</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <StatBox label="今日待复习" value={overview.due} accent="amber" />
          <StatBox label="今日剩余新词" value={overview.newRemaining} accent="blue" />
          <StatBox label="学习中" value={overview.learning} accent="gray" />
          <StatBox label="已掌握" value={overview.mastered} accent="green" />
        </div>

        <div className="mt-5 space-y-2.5">
          <Button size="lg" className="w-full" disabled={nothingToday} onClick={() => onStart("mixed")}>
            <Brain className="size-4" /> {nothingToday ? "今日已完成" : "开始学习"}
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" disabled={overview.due === 0} onClick={() => onStart("review")}>
              <CalendarClock className="size-4" /> 只复习（{overview.due}）
            </Button>
            <Button variant="secondary" disabled={overview.newRemaining === 0} onClick={() => onStart("new")}>
              <Sparkles className="size-4" /> 只学新词（{overview.newRemaining}）
            </Button>
          </div>
          {nothingToday ? (
            <p className="t-label-12 text-center text-gray-800">
              今天的任务都完成了 · 下次复习约在 <span className="tabular-nums">{overview.nextDueLabel}</span> 后
            </p>
          ) : (
            <p className="t-label-12 text-center text-gray-800">
              推荐：先复习到期单词，再学新词；忘记的词会在本轮稍后再次出现。
            </p>
          )}
        </div>

        <Card className="mt-5 space-y-4">
          <div className="t-h-14">学习设置</div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="t-label-13 text-gray-900">每日新词上限</span>
              <span className="t-mono-12 text-gray-800">{cfg.newPerDay} 个</span>
            </div>
            <Slider min={5} max={60} step={5} value={[cfg.newPerDay]} disabled={configPending} onValueChange={([v]) => runConfig(() => onConfig({ newPerDay: v }))} />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 text-gray-900">记忆保持率</div>
            <SegmentedControl
              value={String(cfg.retention)}
              disabled={configPending}
              onValueChange={(v) => runConfig(() => onConfig({ retention: Number(v) }))}
              options={[
                { value: "0.8", label: "0.80 轻松" },
                { value: "0.85", label: "0.85" },
                { value: "0.9", label: "0.90 推荐" },
                { value: "0.95", label: "0.95 严格" },
              ]}
              grow
            />
            <p className="t-label-12 text-gray-700">保持率越高，复习越频繁、记得越牢；0.90 适合大多数情况。</p>
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 text-gray-900">学习模式</div>
            <SegmentedControl
              value={cfg.quizMode}
              disabled={configPending}
              onValueChange={(v) => runConfig(() => onConfig({ quizMode: v }))}
              options={[
                { value: "flip", label: "翻卡自评" },
                { value: "choice", label: "选择题（看词选义）" },
              ]}
              grow
            />
            <p className="t-label-12 text-gray-700">
              翻卡：先回忆，再翻面对照评级；选择题：从四个释义里选出正确的一项（选项凑不够四个的词会回到翻卡）。
            </p>
          </div>
          {cfg.quizMode === "choice" ? (
            <div className="space-y-1.5">
              <div className="t-label-13 text-gray-900">选择题推进方式</div>
              <SegmentedControl
                value={cfg.choiceAdvance}
                disabled={configPending}
                onValueChange={(v) => runConfig(() => onConfig({ choiceAdvance: v }))}
                options={[
                  { value: "auto", label: "自动下一题" },
                  { value: "continue", label: "按「继续」推进" },
                ]}
                grow
              />
              <p className="t-label-12 text-gray-700">自动模式节奏快；「继续」模式会停留展示正误，误触更少。</p>
            </div>
          ) : null}
          <SwitchRow
            label="自动发音"
            hint="卡片出现时用系统语音朗读单词"
            checked={cfg.autoSpeak}
            loading={configPending}
            disabled={configPending}
            onCheckedChange={(v) => runConfig(() => onConfig({ autoSpeak: v }))}
          />
        </Card>

        <div className="t-label-12 mt-4 space-y-1 text-gray-700">
          <p className="flex items-center gap-1.5">
            <Volume2 className="size-3.5" /> 朗读使用设备内置语音（无需配置、无网络请求）。
          </p>
          <p className="flex items-center gap-1.5">
            <RotateCcw className="size-3.5" /> 复习节奏由 FSRS 安排；评错了随时可撤销。
          </p>
          <p className="wv-desktop-only hidden flex-wrap items-center gap-1.5 sm:flex">
            <Keyboard className="size-3.5" /> 桌面键位：翻卡 <Kbd>空格</Kbd> 显示释义、<Kbd>D</Kbd>
            <Kbd>F</Kbd>
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> 评级；选择题 <Kbd>W</Kbd>
            <Kbd>E</Kbd>
            <Kbd>I</Kbd>
            <Kbd>O</Kbd> 直选、<Kbd>F</Kbd>
            <Kbd>J</Kbd> 上/下一个词；<Kbd>R</Kbd> 发音、<Kbd>S</Kbd> 星标；<Kbd>?</Kbd> 查看全部键位。
          </p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent: "amber" | "blue" | "green" | "gray" }) {
  const tone =
    accent === "amber"
      ? "text-amber-900"
      : accent === "blue"
        ? "text-blue-900"
        : accent === "green"
          ? "text-green-900"
          : "text-gray-1000";
  return (
    <Card className="p-3.5">
      <div className={cx("t-h-24 tabular-nums", tone)}>{value}</div>
      <div className="t-label-12 mt-0.5 text-gray-800">{label}</div>
    </Card>
  );
}

/* ---------------- 总结 ---------------- */

function SummaryView({
  book,
  stats,
  durationMs,
  onRestart,
  onHome,
  onExit,
}: {
  book: Wordbook;
  stats: SessionStats;
  durationMs: number;
  onRestart: () => void;
  onHome: () => void;
  onExit: () => void;
}) {
  const accuracy = stats.answered > 0 ? Math.round(((stats.answered - stats.again) / stats.answered) * 100) : 0;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  // 会话结束：立即把本轮学习进度推给云端（静默；自动同步开启时才实际发生）
  useEffect(() => {
    requestSyncNow({ silent: true });
  }, []);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-200 px-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="text-center">
          <div className="text-[34px]">🎉</div>
          <div className="t-h-20 mt-1">本轮学习完成</div>
          <div className="t-label-13 mt-1 text-gray-800">
            {book.name} · 用时 {minutes > 0 ? `${minutes} 分 ` : ""}
            {seconds} 秒
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SummaryRow label="复习卡片" value={String(stats.answered)} />
          <SummaryRow label="正确率" value={`${accuracy}%`} />
          <SummaryRow label="记得 / 轻松" value={`${stats.good} / ${stats.easy}`} />
          <SummaryRow label="模糊 / 忘记" value={`${stats.hard} / ${stats.again}`} />
        </div>
        <div className="grid grid-cols-1 gap-2.5">
          <Button onClick={onRestart}>
            <RotateCcw className="size-4" /> 再来一轮
          </Button>
          <Button variant="secondary" onClick={onHome}>
            回到学习首页
          </Button>
          <Button variant="tertiary" onClick={onExit}>
            回到词库
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-100 p-2.5 shadow-geist-border">
      <div className="t-h-16 tabular-nums">{value}</div>
      <div className="t-label-12 text-gray-800">{label}</div>
    </div>
  );
}

/* ---------------- 快捷键帮助 ---------------- */

function ShortcutHelp({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "flip" | "choice";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="快捷键" desc="桌面端使用；移动端可直接点按操作。" />
      <DialogBody className="space-y-4">
        <KeySection title={mode === "choice" ? "选择题模式" : "翻卡模式"} items={mode === "choice" ? KEYMAP_CHOICE : KEYMAP_FLIP} />
        <KeySection title="通用" items={KEYMAP_COMMON} />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          知道了
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function KeySection({ title, items }: { title: string; items: KeyBinding[] }) {
  return (
    <div>
      <div className="t-label-12 mb-1.5 text-gray-800">{title}</div>
      <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-300 bg-background-100">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="t-label-13 text-gray-1000">{it.label}</div>
              {it.desc ? <div className="t-label-12 text-gray-700">{it.desc}</div> : null}
            </div>
            <KbdGroup keys={it.keys} separator="/" className="shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
