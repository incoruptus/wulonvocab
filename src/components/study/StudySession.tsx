"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { requestSyncNow, requestSyncSoon } from "@/lib/sync/auto";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, CalendarClock, ChevronLeft, ChevronRight, Keyboard, Layers, PauseCircle, RotateCcw, Sparkles, Timer, Undo2, Volume2, X } from "lucide-react";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import {
  formatInterval,
  isNewSrs,
  previewGrades,
  shouldRequeueInSession,
  type GradePreview,
  type GradeValue,
} from "@/lib/study/engine";
import { buildQueue, entryById, requeueInsertIndex, studyConfigOf, studyOverview, type QueueItem, type StudyMode, type StudyOverview } from "@/lib/study/queue";
import { buildQuizQuestion, quizStageOf, type QuizQuestion } from "@/lib/study/quiz";
import { buildCloze, buildSpellQuestion, gradeProductionAnswer, type ProductionGrade, type ProductionQuestion } from "@/lib/study/production";
import { loadAiCloze } from "@/lib/study/clozeAi";
import { loadWordQuizQuestion } from "@/lib/study/quizBank";
import { planQuiz } from "@/lib/study/quizMix";
import { SAMPLE_QUIZ_QUESTIONS } from "@/lib/study/sampleQuizBank";
import { masteryOf } from "@/lib/study/mastery";
import { useReviewMastery } from "@/components/study/useReviewMastery";
import { KEYMAP_CHOICE, KEYMAP_COMMON, KEYMAP_FLIP, type KeyBinding } from "@/lib/study/keymap";
import type { QuizKind, StudyConfig, StudySrs } from "@/lib/study/types";
import { speakWord, cancelSpeech } from "@/lib/study/tts";
import { normalizeChoiceKeys, type ChoiceKeys } from "@/lib/study/keys";
import { Button, IconButton } from "@/components/ui/button";
import { Card, Kbd, KbdGroup, SegmentedControl } from "@/components/ui/misc";
import { Slider, SwitchRow } from "@/components/ui/field";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { StudyCard } from "@/components/study/StudyCard";
import { ProductionCard } from "@/components/study/ProductionCard";
import { ChoiceCard } from "@/components/study/ChoiceCard";
import { QuizCommunityDialog, type QuizCommunityMode } from "@/components/study/QuizCommunityDialog";
import { withSourceCredentials } from "@/lib/credentials";
import { StudyEngineHelp } from "@/components/study/StudyEngineHelp";
import { QuizModeControl } from "@/components/study/QuizModeControl";
import { cx, uid } from "@/lib/utils";
import { transitionNewWord, type NewWordStep } from "@/lib/study/newWordFlow";
import { leechInfoOf } from "@/lib/study/leech";
import { computeStudyPlan, type StudyPlan } from "@/lib/study/planning";
import { batchLabel, buildBatchQueue, type BatchIntent, type BatchSelection } from "@/lib/study/batch";
import type { ReviewSessionMode, ReviewInteraction } from "@/lib/study/reviewLog";
import { useWeakEvidence } from "./useWeakEvidence";
import { useChoiceTimer } from "./useChoiceTimer";

type Phase = "home" | "session" | "summary";
type SessionKind = StudyMode | "cram";
type StudyQuestion = QuizQuestion | ProductionQuestion;
type EffectiveMode = "flip" | "choice" | "cloze" | "spell";

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

function isChoiceQuestion(question: StudyQuestion | null): question is QuizQuestion {
  return Boolean(question && (
    question.kind === "word2def" || question.kind === "word2zh" || question.kind === "zh2word" || question.kind === "def2word"
  ));
}

function isProductionQuestion(question: StudyQuestion | null): question is ProductionQuestion {
  return Boolean(question && (question.kind === "cloze" || question.kind === "spell"));
}

/** 隐藏词头的提取题在判定前不自动朗读，避免答案泄底。 */
function autoSpeakAllowed(entry: Entry | undefined, cfg: StudyConfig): boolean {
  // 混搭在出题前无法确定是否隐藏词头；与选择题一样，统一在判定后朗读。
  return Boolean(entry && cfg.quizMode === "flip");
}

export function StudySession({
  book,
  batch,
  intent,
}: {
  book: Wordbook;
  batch?: BatchSelection | null;
  intent?: BatchIntent;
}) {
  const router = useRouter();
  const practiceOnly = intent === "cram";
  const applyReview = useAppStore((s) => s.applyReview);
  const undoReview = useAppStore((s) => s.undoReview);
  const setStudyConfig = useAppStore((s) => s.setStudyConfig);

  /** 选择题直选键位（可切换 WEIO / ABCD / 自定义；读取经容错归一化） */
  const rawChoiceKeys = useAppStore((s) => s.settings.choiceKeys);
  const choiceKeys = useMemo(() => normalizeChoiceKeys(rawChoiceKeys), [rawChoiceKeys]);

  /** 关闭学习会话后的去向（设置 → 学习：词库页 / 学习中心 / 返回上一页） */
  const exitStudy = useCallback(() => {
    cancelSpeech();
    const dest = useAppStore.getState().settings.studyExit ?? "book";
    if (dest === "learn") router.push("/learn");
    else if (dest === "back") {
      if (typeof window !== "undefined" && window.history.length > 1) router.back();
      else router.push(`/book?id=${book.id}`);
    } else router.push(`/book?id=${book.id}`);
  }, [router, book.id]);

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
  /** 可撤销的作答层数（镜像 sessionGradesRef；驱动「撤销」入口的显隐） */
  const [undoDepth, setUndoDepth] = useState(0);
  /** 最近一次作答评级（总结页撤销按钮的文案用） */
  const [lastRating, setLastRating] = useState<GradeValue | null>(null);
  /** 本场各词「忘记」次数（驱动「先放下」出口的出现与提示） */
  const [againCounts, setAgainCounts] = useState<Record<string, number>>({});
  const [confirmExit, setConfirmExit] = useState(false);
  const [overview, setOverview] = useState<StudyOverview & { nextDueLabel: string }>({
    due: 0,
    newRemaining: 0,
    learning: 0,
    mastered: 0,
    nextDueLabel: "—",
  });
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const weakEvidence = useWeakEvidence();
  const { index: masteryIndex } = useReviewMastery();
  const cardStartRef = useRef(0);
  /** 预览与评分共享的复习时刻（保证 fuzz 播放一致） */
  const reviewNowRef = useRef(0);
  /** 已提交但尚未推进队列的评分（选择题反馈期间） */
  const gradedRef = useRef<{ entryId: string; isNew: boolean; newWord?: boolean; next: StudySrs; rating: GradeValue } | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 答题后的输入锁定（防连发/误触），值为解锁时间戳 */
  const inputLockRef = useRef(0);

  // 选择题模式状态
  const [chosen, setChosen] = useState<number | null>(null);
  const [judged, setJudged] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  /** 本次会话跳过的词（未作答，F 返回用；上限 50 条） */
  const skippedRef = useRef<QueueItem[]>([]);
  /** 本轮已提交评分的快照（「放弃进度并退出」按逆序回滚；U 逐层撤回） */
  const sessionGradesRef = useRef<
    {
      entryId: string;
      before?: StudySrs;
      next: StudySrs;
      rating: GradeValue;
      elapsedMs: number;
      dayKey?: string;
      reviewEventId: string;
      newWord?: boolean;
      newStep?: NewWordStep;
      interaction: ReviewInteraction;
      questionKind?: QuizKind;
      practiceOnly?: boolean;
    }[]
  >([]);
  /** 放弃进度的二次确认（对话框内两段式） */
  const [abandonArmed, setAbandonArmed] = useState(false);
  /** 快捷键帮助弹窗 */
  const [helpOpen, setHelpOpen] = useState(false);
  /** 公共题举报与贡献包 */
  const [quizCommunityMode, setQuizCommunityMode] = useState<QuizCommunityMode>(null);
  /** 正确项位置洗牌袋（每答一题轮换；用 ref 以免触发题目重建） */
  const posBagRef = useRef<number[]>([0, 1, 2, 3]);
  /** 混搭轮转序号与累计次数；只保存在本场，不影响同步配置。 */
  const quizTurnRef = useRef(0);
  const quizChoiceTurnRef = useRef(0);
  const quizUsedRef = useRef<{ families: Partial<Record<"flip" | "choice" | "cloze", number>>; kinds: Partial<Record<NonNullable<StudyConfig["choiceTypes"]>[number], number>> }>({ families: {}, kinds: {} });
  /** 当前卡片的题目（卡片切换时重建；作答后冻结，防止选项重排） */
  const [question, setQuestion] = useState<StudyQuestion | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [productionValue, setProductionValue] = useState("");
  const [productionResult, setProductionResult] = useState<ProductionGrade | null>(null);
  /** 新词三步流程；按 entryId 绑定，切卡自动回到呈现步骤 */
  const [newFlow, setNewFlow] = useState<{ entryId: string; step: NewWordStep } | null>(null);
  const sessionIdRef = useRef("");
  const sessionModeRef = useRef<ReviewSessionMode>("mixed");
  /** 答对后待确认「稳 / 猜」（开启 choiceConfidence 时） */
  const [pendingConfidence, setPendingConfidence] = useState(false);
  /** 本场临时允许相似词（不落库；专门练易混组时用） */
  const [allowSimilar, setAllowSimilar] = useState(false);

  const cfg = studyConfigOf(book);
  const currentItem = queue[0];
  const current = useMemo(() => (queue.length ? entryById(book, queue[0].entryId) : undefined), [book, queue]);
  const newStep: NewWordStep | null = currentItem?.newWord
    ? (newFlow?.entryId === currentItem.entryId ? newFlow.step : "present")
    : null;

  const choiceTypesKey = cfg.choiceTypes.join(",");
  const mixWeightsKey = JSON.stringify([cfg.quizMixWeights, cfg.choiceMixWeights]);

  // 题目只在切卡或配置变化时重建；评分更新词条不会重排选项。
  useEffect(() => {
    let alive = true;
    const raf = requestAnimationFrame(() => {
      setQuestionLoading(false);
      setProductionValue("");
      setProductionResult(null);
      setTimedOut(false);
      if (!current) {
        setQuestion(null);
        return;
      }
      const entries = useAppStore.getState().books.find((b) => b.id === book.id)?.entries ?? book.entries;
      const setChoice = async (kind?: StudyConfig["choiceTypes"][number]) => {
        if (!alive) return;
        const kinds = kind ? [kind] : choiceTypesKey.split(",") as StudyConfig["choiceTypes"];
        if (!kinds.length) {
          setQuestion(null);
          return;
        }
        const state = useAppStore.getState();
        const source = state.lookupSources.find((item) => item.kind === "ai" && item.enabled)
          ?? state.lookupSources.find((item) => item.kind === "ai");
        const bankUrl = state.settings.quizBankUrl?.trim() ?? "";
        const personalQuestions = book.personalQuizBank;
        if (!cfg.aiWordQuiz && !bankUrl && !personalQuestions?.length && !SAMPLE_QUIZ_QUESTIONS.some((item) => item.word.toLowerCase() === current.headword.toLowerCase())) {
          setQuestion(buildQuizQuestion(current, entries, { forceCorrectIndex: posBagRef.current[0], kinds }));
          return;
        }
        setQuestion(null);
        setQuestionLoading(true);
        const runtimeSource = source ? await withSourceCredentials(source) : null;
        if (!alive) return;
        void loadWordQuizQuestion(current, entries, kinds, {
          aiEnabled: cfg.aiWordQuiz,
          aiConfig: runtimeSource ? { baseUrl: runtimeSource.config.baseUrl ?? "", apiKey: runtimeSource.config.apiKey, model: runtimeSource.config.model ?? "" } : undefined,
          bankUrl,
          bankSource: cfg.quizBankSource,
          personalQuestions,
          fallbackQuestions: SAMPLE_QUIZ_QUESTIONS,
          forceCorrectIndex: posBagRef.current[0],
        }).then((next) => {
          if (!alive) return;
          setQuestionLoading(false);
          setQuestion(next);
        }).catch(() => {
          if (!alive) return;
          setQuestionLoading(false);
          setQuestion(buildQuizQuestion(current, entries, { forceCorrectIndex: posBagRef.current[0], kinds }));
        });
      };
      if (newStep === "recognition") {
        setQuestion(buildQuizQuestion(current, entries, { forceCorrectIndex: posBagRef.current[0], kinds: ["word2zh"] }));
        return;
      }
      if (newStep) {
        setQuestion(null);
        return;
      }
      const turn = quizTurnRef.current;
      quizTurnRef.current += 1;
      const planned = planQuiz(cfg, current, turn, quizUsedRef.current, quizChoiceTurnRef.current);
      quizUsedRef.current.families[planned.family] = (quizUsedRef.current.families[planned.family] ?? 0) + 1;
      if (planned.choiceKind) {
        quizChoiceTurnRef.current += 1;
        quizUsedRef.current.kinds[planned.choiceKind] = (quizUsedRef.current.kinds[planned.choiceKind] ?? 0) + 1;
      }
      if (planned.family === "flip") {
        setQuestion(null);
        return;
      }
      if (planned.family === "choice") {
        void setChoice(planned.choiceKind).catch(() => {
          if (!alive) return;
          setQuestionLoading(false);
          setQuestion(null);
        });
        return;
      }

      const stage = quizStageOf(current);
      if (cfg.quizMode === "cloze" && cfg.spellEnabled && stage === "stable") {
        const spell = buildSpellQuestion(current);
        if (spell) {
          setQuestion(spell);
          return;
        }
      }
      const cloze = buildCloze(current, book);
      if (cloze) {
        setQuestion(cloze);
        return;
      }
      if (cfg.aiCloze) {
        const source = useAppStore.getState().lookupSources.find((item) => item.kind === "ai" && item.enabled)
          ?? useAppStore.getState().lookupSources.find((item) => item.kind === "ai");
        if (source?.config.baseUrl && source.config.model) {
          setQuestion(null);
          setQuestionLoading(true);
          void withSourceCredentials(source).then((runtimeSource) => {
            if (!alive) return;
            void loadAiCloze(current, book, {
              baseUrl: runtimeSource.config.baseUrl,
              apiKey: runtimeSource.config.apiKey,
              model: runtimeSource.config.model,
            }).then((result) => {
              if (!alive) return;
              setQuestionLoading(false);
              setQuestion(result?.question ?? null);
            }).catch(() => {
              if (!alive) return;
              setQuestionLoading(false);
              setQuestion(null);
            });
          }).catch(() => {
            if (!alive) return;
            setQuestionLoading(false);
            setQuestion(null);
          });
          return;
        }
      }
      // Cloze 缺例句时保留提取语义，不偷偷换成选择题。
      setQuestion(null);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.quizMode, cfg.aiWordQuiz, cfg.quizBankSource, choiceTypesKey, mixWeightsKey, cfg.spellEnabled, cfg.clozeEnabled, cfg.aiCloze, current?.id, book.id, newStep]);
  const effectiveMode: EffectiveMode = question?.kind === "cloze" || question?.kind === "spell"
    ? question.kind
    : question
      ? "choice"
      : "flip";
  const choiceQuestion = isChoiceQuestion(question) ? question : null;
  const productionQuestion = isProductionQuestion(question) ? question : null;

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
      setPlan(computeStudyPlan(book, now));
    });
    return () => cancelAnimationFrame(raf);
  }, [book, phase]);

  // 离开会话页面时，停掉还在播的语音
  useEffect(() => () => cancelSpeech(), []);

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
    setPreviews(practiceOnly ? [] : previewGrades(current.srs, cfg.retention, now));
    cardStartRef.current = now;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* iOS 无振动 API */
    }
    if (cfg.autoSpeak) speakWord(current.headword, pronLang(current));
  }, [current, cfg.retention, cfg.autoSpeak, practiceOnly]);

  const moveNewWord = useCallback(
    (action: "unfamiliar" | "familiar" | "learned" | "fallback-recall") => {
      if (!current || !newStep) return;
      const next = transitionNewWord(newStep, action);
      if (next.step === "done" || next.step === newStep) return;
      setNewFlow({ entryId: current.id, step: next.step });
      setRevealed(false);
      if (next.step === "recall") {
        const now = Date.now();
        reviewNowRef.current = now;
        setPreviews(previewGrades(current.srs, cfg.retention, now));
      } else {
        setPreviews([]);
      }
      setChosen(null);
      setJudged(false);
      setTimedOut(false);
      setProductionValue("");
      setProductionResult(null);
      cardStartRef.current = Date.now();
    },
    [current, newStep, cfg.retention],
  );

  const startSession = useCallback(
    (mode: SessionKind) => {
      cancelSpeech(); // 清掉上一局可能还在播的语音
      const currentBook = useAppStore.getState().books.find((b) => b.id === book.id) ?? book;
      const items = batch
        ? buildBatchQueue(currentBook, batch, mode === "cram" ? "cram" : intent ?? (mode === "new" ? "new" : "review"), Date.now(), { allowSimilar })
        : mode === "cram"
          ? buildBatchQueue(currentBook, { dimension: "random", size: 8 }, "cram", Date.now(), { allowSimilar })
          : buildQueue(currentBook, mode, Date.now(), {
              allowSimilar,
              order: cfg.queueOrder,
              weakEvidence,
            });
      if (!items.length) {
        toast.info(mode === "cram" ? "这批词暂时没有可练习的内容" : mode === "new" ? "今日新词已学完" : "今天没有要复习的词");
        return;
      }
      setQueue(items);
      setTotalPlanned(items.length);
      setStats({ ...EMPTY_STATS, startedAt: Date.now() });
      sessionIdRef.current = uid();
      sessionModeRef.current = mode;
      setNewFlow(null);
      setUndoDepth(0);
      setLastRating(null);
      gradedRef.current = null;
      clearAutoTimer();
      setRevealed(false);
      setPreviews([]);
      setChosen(null);
      setJudged(false);
      setTimedOut(false);
      setProductionValue("");
      setProductionResult(null);
      setPendingConfidence(false);
      skippedRef.current = [];
      sessionGradesRef.current = [];
      quizTurnRef.current = 0;
      quizChoiceTurnRef.current = 0;
      quizUsedRef.current = { families: {}, kinds: {} };
      setAgainCounts({});
      cardStartRef.current = Date.now();
      setPhase("session");
      const first = entryById(book, items[0].entryId);
      // 选择题在选定题型前无法判断是否隐藏词头（朗读会泄底），统一改为「作答后朗读」
      if (first && cfg.autoSpeak && autoSpeakAllowed(first, cfg)) speakWord(first.headword, pronLang(first));
    },
    [book, batch, intent, cfg, allowSimilar, weakEvidence, clearAutoTimer],
  );

  /** 提交评分（写库 + 统计 + 本机日志 + 撤销快照），不含队列推进 */
  const commitGrade = useCallback(
    (rating: GradeValue, opts?: { interaction?: ReviewInteraction; firstAttempt?: boolean }) => {
      if (!current) return false;
      try {
        navigator.vibrate?.(rating === 1 ? 20 : 10);
      } catch {
        /* iOS 不支持，静默降级 */
      }
      const elapsed = Math.max(0, Date.now() - cardStartRef.current);
      const interaction =
        opts?.interaction ??
        (newStep === "recognition" ? "new-recognition" : newStep === "recall" ? "new-recall" : effectiveMode === "choice" ? "choice" : effectiveMode === "cloze" || effectiveMode === "spell" ? effectiveMode : "flip");
      const res = applyReview(book.id, current.id, rating, elapsed, reviewNowRef.current || Date.now(), {
        sessionId: sessionIdRef.current,
        mode: sessionModeRef.current,
        interaction,
        questionKind: effectiveMode === "choice" || effectiveMode === "cloze" || effectiveMode === "spell" ? question?.kind : undefined,
        firstAttempt: opts?.firstAttempt ?? isNewSrs(current.srs),
        newCard: Boolean(currentItem?.newWord),
        practiceOnly,
      });
      if (!res) return false;
      setStats((st) => ({
        ...st,
        answered: st.answered + 1,
        again: st.again + (rating === 1 ? 1 : 0),
        hard: st.hard + (rating === 2 ? 1 : 0),
        good: st.good + (rating === 3 ? 1 : 0),
        easy: st.easy + (rating === 4 ? 1 : 0),
      }));
      if (rating === 1) setAgainCounts((m) => ({ ...m, [current.id]: (m[current.id] ?? 0) + 1 }));
      setUndoDepth((d) => d + 1);
      setLastRating(rating);
      sessionGradesRef.current.push({
        entryId: current.id,
        before: res.before,
        next: res.next,
        rating,
        elapsedMs: elapsed,
        dayKey: res.dayKey,
        reviewEventId: res.reviewEventId,
        newWord: currentItem?.newWord,
        newStep: newStep ?? undefined,
        interaction,
        questionKind: effectiveMode === "choice" || effectiveMode === "cloze" || effectiveMode === "spell" ? question?.kind : undefined,
        practiceOnly,
      });
      gradedRef.current = { entryId: current.id, isNew: isNewSrs(res.before), newWord: currentItem?.newWord, next: res.next, rating };
      inputLockRef.current = Date.now() + 180;
      return true;
    },
    [book.id, current, currentItem?.newWord, newStep, effectiveMode, question?.kind, practiceOnly, applyReview],
  );

  /** 推进队列（含学习步回炉；opts.park = 显式「先放下」，本轮不再回炉） */
  const advanceCard = useCallback(
    (opts?: { park?: boolean }) => {
      const graded = gradedRef.current;
      if (!graded) return;
      gradedRef.current = null;
      clearAutoTimer();
      setPendingConfidence(false);
      // 已评分的词不再参与 F 返回
      skippedRef.current = skippedRef.current.filter((x) => x.entryId !== graded.entryId);
      const rest = queue.slice(1);
      if (!practiceOnly && !opts?.park && shouldRequeueInSession(graded.next, graded.rating)) {
        const insertAt =
          cfg.similarityAvoid && !allowSimilar
            ? requeueInsertIndex(book.entries, rest, graded.entryId)
            : Math.min(rest.length, 4);
        rest.splice(Math.min(insertAt, rest.length), 0, { entryId: graded.entryId, isNew: false, newWord: graded.newWord });
      }
      setQueue(rest);
      setNewFlow(null);
      setRevealed(false);
      setPreviews([]);
      setChosen(null);
      setJudged(false);
      setTimedOut(false);
      setProductionValue("");
      setProductionResult(null);
      if (rest.length === 0) {
        setStats((st) => ({ ...st, endedAt: Date.now() }));
        setPhase("summary");
      } else {
        const next = entryById(book, rest[0].entryId);
        if (next && cfg.autoSpeak && autoSpeakAllowed(next, cfg)) speakWord(next.headword, pronLang(next));
        cardStartRef.current = Date.now();
      }
    },
    [queue, book, cfg, allowSimilar, practiceOnly, clearAutoTimer],
  );

  /**
   * 选择题词间导航（可不作答自由浏览）：
   * dir=1 跳过当前词（本轮稍后再次出现）；dir=-1 回到最近跳过的词。
   * 仅移动队列位置，不写评分、不影响统计。
   */
  const navigateCard = useCallback(
    (dir: 1 | -1) => {
      if (!queue.length) return;
      if (currentItem?.newWord && gradedRef.current?.entryId === currentItem.entryId) {
        toast.info("先完成这张新词卡，或选择「先放下」");
        return;
      }
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
      setPendingConfidence(false);
      setNewFlow(null);
      setRevealed(false);
      setPreviews([]);
      setChosen(null);
      setJudged(false);
      setTimedOut(false);
      setProductionValue("");
      setProductionResult(null);
      const next = entryById(book, nextEntryId);
      if (next && cfg.autoSpeak && autoSpeakAllowed(next, cfg)) speakWord(next.headword, pronLang(next));
      cardStartRef.current = Date.now();
    },
    [queue, book, cfg, clearAutoTimer, currentItem],
  );

  /** 翻卡模式评级 */
  const onGrade = useCallback(
    (rating: GradeValue) => {
      if (!current) return;
      if (!newStep && !revealed) return;
      if (newStep) {
        if (newStep !== "recall" || rating === 4) return;
        if (revealed && gradedRef.current?.entryId === current.id && gradedRef.current.rating === 1) return;
        const action = rating === 3 ? "recall-good" : rating === 2 ? "recall-hard" : "recall-again";
        const transition = transitionNewWord("recall", action);
        if (transition.step !== "done" || !transition.rating) return;
        if (!commitGrade(transition.rating, { interaction: "new-recall" })) return;
        if (transition.rating === 1) {
          setRevealed(true); // 答不出必须停留并揭晓答案，再继续回炉
          setPreviews([]);
        } else {
          advanceCard();
        }
        return;
      }
      if (commitGrade(rating)) advanceCard();
    },
    [current, revealed, newStep, commitGrade, advanceCard],
  );

  /** 朗读某词条（规则：朗读只发生在「该词可见的那一刻」，绝不在翻页后为上一词发声） */
  const speakEntry = useCallback(
    (entry: Entry | null | undefined) => {
      if (cfg.autoSpeak && entry) speakWord(entry.headword, pronLang(entry));
    },
    [cfg.autoSpeak],
  );

  /** 「稳 / 猜」确认：稳 → Good；猜 → Hard（更贴近真实记忆） */
  const resolveConfidence = useCallback(
    (guessed: boolean) => {
      if (!pendingConfidence) return;
      setPendingConfidence(false);
      if (!commitGrade(guessed ? 2 : 3)) return;
      advanceCard();
    },
    [pendingConfidence, commitGrade, advanceCard],
  );

  /** 选择题作答 */
  const onChoose = useCallback(
    (index: number) => {
      if (!current || !question || judged || pendingConfidence || Date.now() < inputLockRef.current) return;
      if (question.kind !== "word2def" && question.kind !== "word2zh" && question.kind !== "zh2word" && question.kind !== "def2word") return;
      const now = Date.now();
      reviewNowRef.current = now;
      const correct = index === question.correctIndex;
      setChosen(index);
      setTimedOut(false);
      // 洗牌袋轮换（ref 更新，不触发题目重建）
      posBagRef.current = [...posBagRef.current.slice(1), posBagRef.current[0]];
      if (newStep === "recognition") {
        const transition = transitionNewWord("recognition", correct ? "recognized" : "not-recognized");
        if (!transition.rating || !commitGrade(transition.rating, { interaction: "new-recognition", firstAttempt: true })) return;
        setJudged(true);
        speakEntry(current);
        return;
      }
      if (!correct) {
        if (!commitGrade(1)) return;
        setJudged(true);
        speakEntry(current); // 判定即揭晓，此刻朗读（错题停留期间听完）
        return;
      }
      // 答对：开启「稳 / 猜」时先确认再记分（自动前进暂停等待确认）
      if (cfg.choiceConfidence) {
        setJudged(true);
        setPendingConfidence(true);
        speakEntry(current); // 词已揭晓；确认期间自然播完，翻页时不再补读
        return;
      }
      if (!commitGrade(3)) return;
      setJudged(true);
      speakEntry(current);
      // 答对且选择「自动」时才自动前进；答错一律停留等用户确认（给纠正编码的时间）
      if (cfg.choiceAdvance === "auto") {
        clearAutoTimer();
        autoTimerRef.current = setTimeout(advanceCard, 800);
      }
    },
    [current, question, judged, pendingConfidence, newStep, commitGrade, cfg.choiceAdvance, cfg.choiceConfidence, speakEntry, advanceCard, clearAutoTimer],
  );

  /** Word Quiz 超时：按忘记处理，必须停留并揭示答案。 */
  const onChoiceTimeout = useCallback(() => {
    if (!current || !choiceQuestion || judged || pendingConfidence) return;
    const now = Date.now();
    reviewNowRef.current = now;
    inputLockRef.current = now + 180;
    posBagRef.current = [...posBagRef.current.slice(1), posBagRef.current[0]];
    setChosen(null);
    setTimedOut(true);
    if (newStep === "recognition") {
      const transition = transitionNewWord("recognition", "not-recognized");
      if (!transition.rating || !commitGrade(transition.rating, { interaction: "new-recognition", firstAttempt: true })) return;
      setJudged(true);
      speakEntry(current);
      return;
    }
    if (!commitGrade(1)) return;
    setJudged(true);
    speakEntry(current);
  }, [current, choiceQuestion, judged, pendingConfidence, newStep, commitGrade, speakEntry]);

  const choiceDurationMs = (choiceQuestion ? cfg.choiceTimeLimits?.[choiceQuestion.kind] ?? cfg.choiceTimeLimit : cfg.choiceTimeLimit) * 1000;
  const choiceTimer = useChoiceTimer({
    durationMs: choiceDurationMs,
    active: phase === "session" && Boolean(choiceQuestion) && !judged && !pendingConfidence && !questionLoading
      && quizCommunityMode === null && !helpOpen && !confirmExit && !abandonArmed,
    resetKey: `${current?.id ?? "none"}:${choiceQuestion?.kind ?? "none"}:${newStep ?? "review"}`,
    onTimeout: onChoiceTimeout,
  });

  const onSubmitProduction = useCallback(() => {
    if (!current || !question || judged || (question.kind !== "cloze" && question.kind !== "spell") || !productionValue.trim() || Date.now() < inputLockRef.current) return;
    const now = Date.now();
    reviewNowRef.current = now;
    const result = gradeProductionAnswer(productionValue, question);
    const rating: GradeValue = result.exact && masteryOf(masteryIndex, current.id).recall.successes > 0 ? 4 : result.rating;
    if (!commitGrade(rating, { interaction: question.kind, firstAttempt: true })) return;
    setProductionResult(result);
    setJudged(true);
    inputLockRef.current = now + 180;
    speakEntry(current);
  }, [current, question, judged, productionValue, masteryIndex, commitGrade, speakEntry]);

  const continueAfterChoice = useCallback(() => {
    if (newStep === "recognition" && current && question && (
      question.kind === "word2def" || question.kind === "word2zh" || question.kind === "zh2word" || question.kind === "def2word"
    )) {
      if (chosen === question.correctIndex) {
        advanceCard();
      } else {
        setNewFlow({ entryId: current.id, step: "teaching" });
        setChosen(null);
        setJudged(false);
        setTimedOut(false);
        setProductionValue("");
        setProductionResult(null);
        setRevealed(false);
        setPreviews([]);
        cardStartRef.current = Date.now();
      }
      return;
    }
    advanceCard();
  }, [newStep, current, question, chosen, advanceCard]);

  /**
   * 撤销上一次作答（会话中与结束页通用，逐层可撤）：
   * - 写库撤销走 store.undoReview（含合并信号，见 store 内注释）；
   * - 快照来源 sessionGradesRef（与「放弃本轮进度」同一账本，两者永不脱节）；
   * - 结束页调用时回到会话并重新出示该词，让手滑的评分可以重新给出。
   */
  const onUndo = useCallback(() => {
    // 「稳/猜」待确认期间：当前作答尚未落账，撤销会误伤上一张 → 先挡住
    if (pendingConfidence) return;
    const g = sessionGradesRef.current.pop();
    if (!g) return;
    clearAutoTimer();
    setPendingConfidence(false);
    const now = Date.now();
    undoReview(book.id, g.entryId, g.before, g.rating, g.elapsedMs, g.dayKey, now, g.reviewEventId, g.practiceOnly);
    if (g.rating === 1) {
      setAgainCounts((m) => {
        const next = { ...m };
        const left = (next[g.entryId] ?? 1) - 1;
        if (left <= 0) delete next[g.entryId];
        else next[g.entryId] = left;
        return next;
      });
    }
    setStats((st) => ({
      ...st,
      answered: Math.max(0, st.answered - 1),
      again: st.again - (g.rating === 1 ? 1 : 0),
      hard: st.hard - (g.rating === 2 ? 1 : 0),
      good: st.good - (g.rating === 3 ? 1 : 0),
      easy: st.easy - (g.rating === 4 ? 1 : 0),
    }));
    setUndoDepth((d) => Math.max(0, d - 1));
    setLastRating(sessionGradesRef.current.at(-1)?.rating ?? null);
    setQueue((q) => [{ entryId: g.entryId, isNew: isNewSrs(g.before), newWord: g.newWord }, ...q.filter((x) => x.entryId !== g.entryId)]);
    const previousSame = [...sessionGradesRef.current].reverse().find((item) => item.entryId === g.entryId);
    gradedRef.current = previousSame
      ? { entryId: previousSame.entryId, isNew: isNewSrs(previousSame.before), newWord: previousSame.newWord, next: previousSame.next, rating: previousSame.rating }
      : null;
    setNewFlow(g.newWord && g.newStep ? { entryId: g.entryId, step: g.newStep } : null);
    setChosen(null);
    setJudged(false);
    setTimedOut(false);
    setProductionValue("");
    setProductionResult(null);
    setPhase((p) => (p === "summary" ? "session" : p));
    reviewNowRef.current = now;
    if (g.questionKind === "cloze" || g.questionKind === "spell") {
      setRevealed(false);
      setPreviews([]);
    } else if (g.practiceOnly) {
      setRevealed(true);
      setPreviews([]);
    } else if (g.newStep === "recognition" || (!g.newWord && cfg.quizMode === "choice")) {
      setRevealed(false);
      setPreviews([]);
    } else if (g.newStep === "recall") {
      setRevealed(false);
      setPreviews([]);
    } else {
      // 预览要与撤销后的存储状态同构（store 会把 lastReview 提到 now）
      const stamped = g.before ? { ...g.before, lastReview: Math.max(g.before.lastReview ?? 0, now) } : undefined;
      setRevealed(true);
      setPreviews(previewGrades(stamped, cfg.retention, now));
    }
    cardStartRef.current = now;
    // 撤销结果尽快覆盖云端旧状态（未配置自动同步时静默）
    requestSyncSoon(3000);
  }, [book.id, undoReview, cfg.retention, cfg.quizMode, clearAutoTimer, pendingConfidence]);

  /** 当前词的「忘记」次数（驱动「先放下」） */
  const againCount = current ? (againCounts[current.id] ?? 0) : 0;
  const parkEligible = !practiceOnly && againCount >= 1;

  /**
   * 先放下这个词：记下「忘记」（如果还没记）并结束本轮回炉。
   * 语义：记忆状态如实记录（Again），改变的只是本场的练习安排——不再回炉、下次优先复习。
   */
  const onPark = useCallback(() => {
    if (!current || !parkEligible) return;
    if (newStep) {
      if (gradedRef.current?.entryId === current.id && gradedRef.current.rating === 1) {
        advanceCard({ park: true });
      } else if (newStep === "recall" && revealed) {
        if (!commitGrade(1, { interaction: "new-recall" })) return;
        advanceCard({ park: true });
      } else {
        return;
      }
    } else if (effectiveMode === "cloze" || effectiveMode === "spell") {
      if (!judged || productionResult?.exact || productionResult?.distance === 1) return;
      advanceCard({ park: true });
    } else if (effectiveMode === "flip") {
      if (!revealed) return;
      if (!commitGrade(1)) return;
      advanceCard({ park: true });
    } else {
      if (timedOut) {
        advanceCard({ park: true });
      } else if (!judged || !choiceQuestion || chosen === null || chosen === choiceQuestion.correctIndex) {
        return;
      } else {
        advanceCard({ park: true });
      }
    }
    toast.info("已先放下这个词", { description: practiceOnly ? "本轮不再出现，自由练习不改变复习计划。" : "本轮不再出现；下次学习时它会排在前面。" });
  }, [current, parkEligible, newStep, revealed, timedOut, effectiveMode, commitGrade, advanceCard, judged, productionResult, choiceQuestion, chosen, practiceOnly]);

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
        if (current && !(question?.hideWord && !judged)) speakWord(current.headword, pronLang(current));
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

      if (newStep === "present" || newStep === "teaching" || (newStep === "recognition" && !question)) {
        const k = ev.key.toLowerCase();
        if (newStep === "present" && k === "f") {
          ev.preventDefault();
          moveNewWord("unfamiliar");
        } else if (newStep === "present" && k === "j") {
          ev.preventDefault();
          moveNewWord("familiar");
        } else if (newStep === "teaching" && (ev.key === " " || ev.key === "Enter")) {
          ev.preventDefault();
          moveNewWord("learned");
        } else if (newStep === "recognition" && (ev.key === " " || ev.key === "Enter")) {
          ev.preventDefault();
          moveNewWord("fallback-recall");
        }
        return;
      }

      if (newStep === "recall") {
        if (revealed && gradedRef.current?.entryId === current?.id && gradedRef.current?.rating === 1) {
          if (ev.key === "x" || ev.key === "X") {
            ev.preventDefault();
            onPark();
          } else if (ev.key === " " || ev.key === "Enter") {
            ev.preventDefault();
            advanceCard();
          }
          return;
        }
        if (!revealed && Date.now() >= inputLockRef.current) {
          const grade = KEY_TO_GRADE[ev.key.toLowerCase()];
          if (grade && grade <= 3) {
            ev.preventDefault();
            onGrade(grade);
          }
        }
        return;
      }

      if (effectiveMode === "cloze" || effectiveMode === "spell") {
        if (judged) {
          if ((ev.key === "x" || ev.key === "X") && parkEligible) {
            ev.preventDefault();
            onPark();
          } else if (ev.key === " " || ev.key === "Enter") {
            ev.preventDefault();
            advanceCard();
          }
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          onSubmitProduction();
        }
        return;
      }

      if (effectiveMode === "choice" && choiceQuestion) {
        if (!judged) {
          if (Date.now() < inputLockRef.current) return;
          const k = ev.key.toLowerCase();
          if (pendingConfidence && k === "g") {
            ev.preventDefault();
            resolveConfidence(true);
            return;
          }
          const idx = (choiceKeys as readonly string[]).indexOf(k);
          if (idx >= 0 && idx < choiceQuestion.options.length) {
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
        } else if ((ev.key === "x" || ev.key === "X") && parkEligible) {
          ev.preventDefault();
          onPark();
        } else if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          if (pendingConfidence) {
            resolveConfidence(false); // 空格视为「稳」
            return;
          }
          // 与「继续」按钮的显示条件一致：答错必停留，答对时仅「按继续推进」模式需要手动
          const isCorrect = chosen !== null && chosen === choiceQuestion.correctIndex;
          if (!isCorrect || cfg.choiceAdvance === "continue" || newStep === "recognition") continueAfterChoice();
          return;
        }
        return;
      }

      // 翻卡模式
      if ((ev.key === "x" || ev.key === "X") && revealed && parkEligible && Date.now() >= inputLockRef.current) {
        ev.preventDefault();
        onPark();
        return;
      }
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
  }, [phase, revealed, effectiveMode, question, choiceQuestion, judged, chosen, current, helpOpen, confirmExit, onReveal, onUndo, onGrade, onChoose, advanceCard, navigateCard, requestExit, cfg.choiceAdvance, pendingConfidence, resolveConfidence, toggleStar, book.id, choiceKeys, parkEligible, onPark, newStep, moveNewWord, continueAfterChoice, onSubmitProduction]);

  // 结束页：U 也能撤销上一次作答（手滑救回），撤销后回到会话重新出示该词
  useEffect(() => {
    if (phase !== "summary") return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (ev.key === "u" || ev.key === "U") {
        ev.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, onUndo]);

  const doneCount = totalPlanned; // 计划总数（用于未来的进度文案扩展）
  void doneCount;

  /* ---------------- 渲染 ---------------- */

  if (phase === "home") {
    if (batch) {
      return (
        <BatchHome
          book={book}
          selection={batch}
          initialIntent={intent ?? "new"}
          onStart={(selected) => startSession(selected)}
          onExit={exitStudy}
        />
      );
    }
    return (
      <HomeView
        book={book}
        cfg={cfg}
        overview={overview}
        plan={plan}
        onStart={startSession}
        onConfig={(patch) => setStudyConfig(book.id, patch)}
        allowSimilar={allowSimilar}
        onAllowSimilar={setAllowSimilar}
        onExit={exitStudy}
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
        undoLast={undoDepth > 0 && lastRating ? { rating: lastRating } : null}
        onUndoLast={onUndo}
        onRestart={() => startSession(sessionModeRef.current)}
        onHome={() => setPhase("home")}
        onExit={exitStudy}
        practiceOnly={practiceOnly}
      />
    );
  }

  const remaining = queue.length;
  const progress = stats.answered + remaining > 0 ? stats.answered / (stats.answered + remaining) : 0;
  const choiceCorrect = choiceQuestion && (chosen !== null || timedOut) ? chosen === choiceQuestion.correctIndex : null;

  return (
    <div className="flex h-dvh flex-col bg-background-200 touch-manipulation">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-300 bg-background-100 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <IconButton label="退出学习" onClick={requestExit}>
          <X className="size-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2">
            <span className="t-label-12 tabular-nums text-gray-800">{practiceOnly ? `自由练习 · 剩余 ${remaining}` : `剩余 ${remaining}`}</span>
            <span className="text-gray-500">·</span>
            <span className="t-label-12 tabular-nums text-gray-800">已答 {stats.answered}</span>
            {undoDepth > 0 ? (
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
        {practiceOnly ? <span className="hidden rounded-full bg-amber-700/10 px-2 py-1 t-label-12 text-amber-900 sm:inline">自由练习</span> : null}
        <IconButton label="快捷键帮助（?）" className="wv-desktop-only hidden sm:inline-flex" onClick={() => setHelpOpen(true)}>
          <Keyboard className="size-4" />
        </IconButton>
      </header>

      {/* 卡片区 */}
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto scroll-thin">
        <div className="flex min-h-full items-start justify-center px-3 py-5 sm:items-center sm:py-8">
          {current ? (
            productionQuestion ? (
              <ProductionCard
                entry={current}
                question={productionQuestion}
                value={productionValue}
                judged={judged}
                result={productionResult}
                starred={current.starred}
                onValueChange={setProductionValue}
                onSubmit={onSubmitProduction}
                onToggleStar={() => toggleStar(book.id, current.id)}
                onSkip={() => navigateCard(1)}
              />
            ) : questionLoading ? (
              <Card className="w-full max-w-xl py-10 text-center">
                <div className="t-h-16">正在准备题目…</div>
                <p className="t-label-13 mt-2 text-gray-800">先查已启用的题库，再按需生成；不可用时会使用词条现有内容。</p>
                <Button variant="secondary" className="mt-4" onClick={() => navigateCard(1)}>跳过这个词</Button>
              </Card>
            ) : choiceQuestion ? (
              <ChoiceCard
                entry={current}
                question={choiceQuestion}
                judged={judged}
                chosen={chosen}
                starred={current.starred}
                optionKeys={choiceKeys.map((k) => k.toUpperCase())}
                remainingMs={choiceTimer.remainingMs}
                durationMs={choiceDurationMs}
                timerPaused={choiceTimer.paused}
                onReport={() => setQuizCommunityMode("report")}
                onContribute={() => setQuizCommunityMode("contribute")}
                onToggleStar={() => toggleStar(book.id, current.id)}
                onChoose={onChoose}
                onSkip={() => navigateCard(1)}
              />
            ) : (
              <StudyCard
                book={book}
                entry={current}
                revealed={newStep === "present" || newStep === "teaching" ? true : revealed}
                onReveal={onReveal}
                starred={current.starred}
                onToggleStar={() => toggleStar(book.id, current.id)}
                revealable={newStep !== "recall"}
              />
            )
          ) : (
            <div className="t-label-13 text-gray-800">正在准备下一张卡片…</div>
          )}
        </div>
      </div>

      {/* 底部操作区（拇指自然区）：揭示前=大按钮 · 揭示后=评级 · 选择题=作答反馈 */}
      <footer role="group" aria-label="作答与评级" className="shrink-0 border-t border-gray-300 bg-background-100 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
        {newStep === "present" || newStep === "teaching" || (newStep === "recognition" && !question) ? (
          <div className="mx-auto max-w-xl space-y-2">
            {parkEligible ? (
              <div className="flex justify-center">
                <button type="button" onClick={onPark} className="t-label-12 inline-flex items-center gap-1 rounded-full px-3 py-1 text-gray-800 hover:bg-gray-100">
                  <PauseCircle className="size-3.5" /> 先放下 <Kbd className="wv-desktop-only hidden sm:inline-flex">X</Kbd>
                </button>
              </div>
            ) : null}
            {newStep === "present" ? (
              <>
                <p className="t-label-12 text-center text-gray-700">先看内容，凭第一感觉选择；这一步不评分。</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => moveNewWord("unfamiliar")} className="flex h-14 flex-col items-center justify-center rounded-xl bg-gray-100 text-gray-1000 hover:bg-gray-200">
                    <span className="text-[15px] font-medium">没印象 <Kbd className="wv-desktop-only hidden sm:inline-flex">F</Kbd></span>
                    <span className="t-label-12 text-gray-700">留在教学卡，再试回忆</span>
                  </button>
                  <button type="button" onClick={() => moveNewWord("familiar")} className="flex h-14 flex-col items-center justify-center rounded-xl bg-blue-100 text-blue-1000 hover:bg-blue-200">
                    <span className="text-[15px] font-medium">有印象 <Kbd className="wv-desktop-only hidden sm:inline-flex">J</Kbd></span>
                    <span className="t-label-12 opacity-75">用四选一验证</span>
                  </button>
                </div>
              </>
            ) : newStep === "recognition" ? (
              <div className="space-y-2 text-center">
                <p className="t-label-12 text-gray-700">这个词暂时凑不出四个可靠选项，改用回忆自评。</p>
                <button type="button" onClick={() => moveNewWord("fallback-recall")} className="h-12 w-full rounded-xl bg-gray-1000 text-[15px] font-medium text-background-100 hover:bg-gray-900">
                  进入回忆验证
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => moveNewWord("learned")} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gray-1000 text-[16px] font-medium text-background-100 hover:bg-gray-900">
                我记住了，考我 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
              </button>
            )}
          </div>
        ) : effectiveMode === "cloze" || effectiveMode === "spell" ? (
          judged ? (
            <div className="mx-auto flex max-w-xl items-center gap-2">
              <div role="status" className="t-label-13 min-w-0 flex-1 rounded-lg bg-background-200 px-3 py-2.5 text-gray-900">
                已提交 · 首次评分不再更改
              </div>
              {parkEligible && productionResult && !productionResult.exact && productionResult.distance !== 1 ? (
                <button type="button" onClick={onPark} className="t-label-12 inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-gray-800 hover:bg-gray-100">
                  <PauseCircle className="size-3.5" /> 先放下
                </button>
              ) : null}
              <Button size="md" className="h-11 shrink-0" onClick={() => advanceCard()}>
                继续 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
              </Button>
            </div>
          ) : (
            <div className="mx-auto flex h-12 max-w-xl items-center justify-center gap-3 text-[13px] text-gray-700">
              <span className="wv-desktop-only hidden items-center gap-1.5 sm:inline-flex"><Kbd>Enter</Kbd> 提交答案</span>
              <span className="wv-touch-only">填写上方答案后提交 · 输入法组合期间不会误提交</span>
            </div>
          )
        ) : choiceQuestion ? (
          judged ? (
            pendingConfidence ? (
              <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => resolveConfidence(false)}
                  className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-gray-1000 text-background-100 transition-colors hover:bg-gray-900"
                >
                  <span className="flex items-center gap-1.5 text-[15px] font-medium">
                    稳稳想起
                    <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
                  </span>
                  <span className="t-label-12 opacity-75">记为「记得」</span>
                </button>
                <button
                  type="button"
                  onClick={() => resolveConfidence(true)}
                  className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-amber-700/20 text-amber-900 transition-colors hover:bg-amber-700/30"
                >
                  <span className="flex items-center gap-1.5 text-[15px] font-medium">
                    猜的
                    <Kbd className="wv-desktop-only hidden border-amber-700/30 bg-white/50 shadow-none sm:inline-flex">G</Kbd>
                  </span>
                  <span className="t-label-12 opacity-80">记为「模糊」</span>
                </button>
              </div>
            ) : (
            <div className="mx-auto flex max-w-xl items-center gap-2">
              <div
                role="status"
                className={cx(
                  "t-label-13 min-w-0 flex-1 rounded-lg px-3 py-2.5",
                  choiceCorrect ? "bg-green-800/10 text-green-900" : "bg-red-700/10 text-red-900",
                )}
              >
                {choiceCorrect ? (
                  <>{newStep === "recognition" ? "✓ 回答正确 · 再认记「模糊」" : "✓ 回答正确 · 记为「记得」"}</>
                ) : (
                  <span className="line-clamp-2">
                    {timedOut ? "时间到 · " : "✗ "}正确答案：{"ABCD"[choiceQuestion.correctIndex]}. {choiceQuestion.options[choiceQuestion.correctIndex].text}
                    {newStep === "recognition" ? " · 记入「忘记」，回教学卡" : " · 记入「忘记」"}
                  </span>
                )}
              </div>
              {parkEligible && choiceCorrect === false ? (
                <button
                  type="button"
                  onClick={onPark}
                  className="t-label-12 inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-gray-800 transition-colors hover:bg-gray-100"
                >
                  <PauseCircle className="size-3.5" /> 先放下
                  <Kbd className="wv-desktop-only hidden sm:inline-flex">X</Kbd>
                </button>
              ) : null}
              {!choiceCorrect || cfg.choiceAdvance === "continue" || newStep === "recognition" ? (
                <Button size="md" className="h-11 shrink-0 gap-2 px-5" onClick={continueAfterChoice}>
                  {newStep === "recognition" && !choiceCorrect ? "回教学卡" : "继续"} <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
                </Button>
              ) : null}
            </div>
            )
          ) : (
            <div className="mx-auto flex h-12 max-w-xl items-center justify-center gap-3 text-[13px] text-gray-700">
              <span className="wv-desktop-only hidden items-center gap-1.5 sm:inline-flex">
                <KbdGroup keys={choiceKeys.map((k) => k.toUpperCase())} /> 选答案
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
        ) : newStep === "recall" ? (
          revealed ? (
            <div className="mx-auto flex max-w-xl items-center gap-2">
              <div role="status" className="t-label-13 min-w-0 flex-1 rounded-lg bg-red-700/10 px-3 py-2.5 text-red-900">
                说不出 · 正确答案已显示，记入「忘记」
              </div>
              {parkEligible ? (
                <button type="button" onClick={onPark} className="t-label-12 inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-gray-800 hover:bg-gray-100">
                  <PauseCircle className="size-3.5" /> 先放下 <Kbd className="wv-desktop-only hidden sm:inline-flex">X</Kbd>
                </button>
              ) : null}
              <Button size="md" className="h-11 shrink-0 gap-2 px-5" onClick={() => advanceCard()}>
                继续 <Kbd className="wv-desktop-only hidden border-white/25 bg-white/15 text-white shadow-none sm:inline-flex">空格</Kbd>
              </Button>
            </div>
          ) : (
            <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
              {([1, 2, 3] as GradeValue[]).map((rating) => {
                const pv = previews.find((p) => p.rating === rating);
                const label = rating === 1 ? "说不出" : rating === 2 ? "想很久" : "说对了";
                return (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => onGrade(rating)}
                    className={cx("flex h-14 flex-col items-center justify-center rounded-xl transition-colors", GRADE_STYLE[rating])}
                  >
                    <span className="flex items-center gap-1.5 text-[14px] font-medium">
                      {label}
                      <Kbd className="wv-desktop-only hidden h-[18px] min-w-[18px] border-gray-400/40 bg-white/50 px-1 text-[10px] shadow-none sm:inline-flex">{GRADE_KEY[rating]}</Kbd>
                    </span>
                    <span className="t-mono-12 opacity-75">{pv ? pv.text : practiceOnly ? "不写入计划" : "—"}</span>
                  </button>
                );
              })}
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
          <>
            {parkEligible ? (
              <div className="mx-auto mb-1 flex max-w-xl justify-center">
                <button
                  type="button"
                  onClick={onPark}
                  className="t-label-12 inline-flex items-center gap-1 rounded-full px-3 py-1 text-gray-800 transition-colors hover:bg-gray-100"
                >
                  <PauseCircle className="size-3.5" />
                  先放下{againCount >= 2 ? `（已忘 ${againCount} 次）` : ""}
                  <span className="hidden text-gray-700 sm:inline">· 本轮不再出现</span>
                  <Kbd className="wv-desktop-only hidden sm:inline-flex">X</Kbd>
                </button>
              </div>
            ) : null}
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
                  <span className="t-mono-12 opacity-75">{pv ? pv.text : practiceOnly ? "不写入计划" : "—"}</span>
                </button>
              );
            })}
            </div>
          </>
        )}
      </footer>

      {/* 退出确认：保留进度 / 放弃本轮进度（两段式） */}
      <Dialog
        open={confirmExit}
        onOpenChange={(v) => {
          if (!v) setAbandonArmed(false);
          setConfirmExit(v);
        }}
      >
        <DialogHeader
          title="结束本次学习？"
          desc={`已完成 ${stats.answered} 张卡片；默认保留进度，下次接着学。`}
        />
        <DialogBody>
          <p className="t-label-12 text-gray-700">
            {stats.answered > 0
              ? "也可以放弃本轮进度：本次会话里评过的词会回到开始前的状态（每日统计一并回滚）。"
              : "本轮还没有评分记录。"}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmExit(false)}>
            继续学习
          </Button>
          {stats.answered > 0 ? (
            <Button
              variant="secondary"
              className={cx(abandonArmed && "text-red-900")}
              onClick={() => {
                if (!abandonArmed) {
                  setAbandonArmed(true);
                  return;
                }
                const grades = sessionGradesRef.current;
                for (let i = grades.length - 1; i >= 0; i -= 1) {
                  const g = grades[i];
                  undoReview(book.id, g.entryId, g.before, g.rating, g.elapsedMs, g.dayKey, undefined, g.reviewEventId, g.practiceOnly);
                }
                sessionGradesRef.current = [];
                setAbandonArmed(false);
                setConfirmExit(false);
                toast.success(`已放弃本轮进度（回滚 ${grades.length} 次作答）`);
                exitStudy();
              }}
            >
              {abandonArmed ? `确认放弃（回滚 ${stats.answered} 次作答）` : "放弃进度并退出"}
            </Button>
          ) : null}
          <Button variant="error" onClick={exitStudy}>
            保留进度退出
          </Button>
        </DialogFooter>
      </Dialog>

      <QuizCommunityDialog
        key={`${choiceQuestion?.sharedId ?? choiceQuestion?.word ?? "none"}:${choiceQuestion?.kind ?? "none"}`}
        open={quizCommunityMode !== null}
        onOpenChange={(open) => { if (!open) setQuizCommunityMode(null); }}
        mode={quizCommunityMode}
        question={choiceQuestion}
      />

        {/* 快捷键帮助（功能 | 键位 两列） */}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} mode={effectiveMode} choiceKeys={choiceKeys} newStep={newStep} />
    </div>
  );
}

/* ---------------- 学习批次首页 ---------------- */

function BatchHome({
  book,
  selection,
  initialIntent,
  onStart,
  onExit,
}: {
  book: Wordbook;
  selection: BatchSelection;
  initialIntent: BatchIntent;
  onStart: (intent: BatchIntent) => void;
  onExit: () => void;
}) {
  const primary = initialIntent === "review" ? "复习这批" : initialIntent === "cram" ? "自由练习这批" : "学这批新词";
  return (
    <div className="min-h-dvh bg-background-200">
      <div className="mx-auto w-full max-w-xl px-4 py-5 pb-10 sm:py-8">
        <div className="flex items-center gap-2">
          <IconButton label="返回词库" onClick={onExit}><ChevronLeft className="size-4" /></IconButton>
          <div className="min-w-0">
            <div className="t-h-16 truncate">{book.name}</div>
            <div className="t-label-12 text-gray-800">学习批次 · 5–10 词</div>
          </div>
        </div>
        <Card className="mt-5 space-y-5 p-5">
          <div>
            <div className="t-h-20">{batchLabel(book, selection)}</div>
            <p className="t-label-13 mt-2 text-gray-800">批次只决定这次练哪些词，不复制词条，也不改变原来的浏览分区。</p>
          </div>
          <div className="rounded-lg bg-background-200 p-3 t-label-12 text-gray-800">
            新词按词库配置的顺序引入；复习优先取当前最可能忘的词。自由练习每词只出现一次，不写入记忆计划，也不计入每日目标。
          </div>
          <Button size="lg" className="w-full" onClick={() => onStart(initialIntent)}>
            {initialIntent === "cram" ? <Sparkles className="size-4" /> : initialIntent === "review" ? <CalendarClock className="size-4" /> : <Layers className="size-4" />}
            {primary}
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            {initialIntent !== "new" ? <Button variant="secondary" onClick={() => onStart("new")}><Layers className="size-4" /> 学这批新词</Button> : null}
            {initialIntent !== "review" ? <Button variant="secondary" onClick={() => onStart("review")}><CalendarClock className="size-4" /> 复习这批</Button> : null}
            {initialIntent !== "cram" ? <Button variant="secondary" className="col-span-2" onClick={() => onStart("cram")}><Sparkles className="size-4" /> 自由练习这批</Button> : null}
          </div>
        </Card>
        <Card className="mt-4 space-y-2">
          <div className="t-label-13 font-medium text-gray-900">自由练习的评分边界</div>
          <p className="t-label-12 text-gray-800">忘记＝完全想不起来；模糊＝想起来了但很吃力；记得＝正常回忆；轻松＝毫不费力。评分只用于本次反馈，不会让到期时间突然变短。</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- 首页 ---------------- */

function HomeView({
  book,
  cfg,
  overview,
  plan,
  onStart,
  onConfig,
  allowSimilar,
  onAllowSimilar,
  onExit,
}: {
  book: Wordbook;
  cfg: StudyConfig;
  overview: StudyOverview & { nextDueLabel: string };
  plan: StudyPlan | null;
  onStart: (mode: StudyMode) => void;
  onConfig: (patch: Partial<StudyConfig>) => Promise<boolean> | null | void;
  allowSimilar: boolean;
  onAllowSimilar: (v: boolean) => void;
  onExit: () => void;
}) {
  const plannedReviews = plan?.reviews ?? overview.due;
  const plannedNew = plan?.newWords ?? overview.newRemaining;
  const nothingToday = plannedReviews === 0 && plannedNew === 0;
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
          <StatBox label="稳固（当前）" value={overview.mastered} accent="green" />
        </div>

        {plan ? (
          <Card className="mt-5 space-y-3 border-0 bg-blue-100/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="t-h-14">今日计划</div>
                <p className="t-label-12 mt-1 text-gray-800">{plan.explanation}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-100 px-2 py-1 t-label-12 text-gray-800">
                <Timer className="size-3" /> 约 {plan.estimatedMinutes} 分钟
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 t-label-12 text-gray-800">
              <span>复习 {plan.reviews} 词</span>
              <span>新词 {plan.newWords} 词</span>
              {plan.backlog > 0 ? <span>顺延 {plan.backlog} 词</span> : null}
              <span>预算 {plan.dailyMinutes} 分钟</span>
            </div>
            <Link href={`/settings/study?book=${book.id}`} className="t-label-12 text-blue-900 hover:underline">
              调整时间预算与目标日期
            </Link>
          </Card>
        ) : null}

        <div className="mt-5 space-y-2.5">
          <Button size="lg" className="w-full" disabled={nothingToday} onClick={() => onStart("mixed")}>
            <Brain className="size-4" /> {nothingToday ? "今日计划已完成" : "开始今日计划"}
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" disabled={plannedReviews === 0} onClick={() => onStart("review")}>
              <CalendarClock className="size-4" /> 只复习（{plannedReviews}）
            </Button>
            <Button variant="secondary" disabled={plannedNew === 0} onClick={() => onStart("new")}>
              <Sparkles className="size-4" /> 只学新词（{plannedNew}）
            </Button>
          </div>
          {nothingToday ? (
            <p className="t-label-12 text-center text-gray-800">
              {plan?.backlog
                ? `当前预算内不再安排新卡，${plan.backlog} 个到期词会留到后续计划。`
                : nothingToday
                  ? <>今天的任务都完成了 · 下次复习约在 <span className="tabular-nums">{overview.nextDueLabel}</span> 后</>
                  : "推荐：先复习到期单词，再学新词；忘记的词会在本轮稍后再次出现。"}
            </p>
          ) : (
            <p className="t-label-12 text-center text-gray-800">
              推荐：先复习到期单词，再学新词；忘记的词会在本轮稍后再次出现。
            </p>
          )}
        </div>

        <Card className="mt-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="t-h-14">学习设置</div>
            <StudyEngineHelp />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="t-label-13 text-gray-900">每日新词上限</span>
              <span className="t-mono-12 text-gray-800">{cfg.newPerDay} 个</span>
            </div>
            <Slider min={5} max={60} step={5} value={[cfg.newPerDay]} disabled={configPending} onValueChange={([v]) => runConfig(() => onConfig({ newPerDay: v }))} />
          </div>
          <QuizModeControl cfg={cfg} disabled={configPending} onChange={onConfig} compact />
          <div className="space-y-1.5 border-t border-gray-300 pt-3">
            <div className="t-label-13 text-gray-900">出题顺序</div>
            <SegmentedControl
              value={cfg.queueOrder}
              disabled={configPending}
              onValueChange={(v) => runConfig(() => onConfig({ queueOrder: v as "due" | "shuffle" }))}
              options={[
                { value: "due", label: "到期优先" },
                { value: "shuffle", label: "随机乱序" },
              ]}
              grow
            />
            <p className="t-label-12 text-gray-700">到期优先先照顾最该复习的词；随机乱序打散顺序，减少位置记忆。</p>
          </div>
          <SwitchRow
            label="本场允许相似词"
            hint="只对这次会话生效、不保存；专门练易混词组时打开"
            checked={allowSimilar}
            onCheckedChange={onAllowSimilar}
          />
          <SwitchRow
            label="自动发音"
            hint="卡片出现时用系统语音朗读单词"
            checked={cfg.autoSpeak}
            loading={configPending}
            disabled={configPending}
            onCheckedChange={(v) => runConfig(() => onConfig({ autoSpeak: v }))}
          />
          <Link
            href={`/settings/study?book=${book.id}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-background-100 px-3 py-2.5 shadow-geist-border transition-colors hover:bg-gray-100"
          >
            <span className="t-label-13 text-gray-900">更多学习设置</span>
            <span className="inline-flex items-center gap-0.5 t-label-12 text-gray-700">
              保持率、题型与键位 <ChevronRight className="size-3.5" />
            </span>
          </Link>
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
  undoLast,
  onUndoLast,
  onRestart,
  onHome,
  onExit,
  practiceOnly,
}: {
  book: Wordbook;
  stats: SessionStats;
  durationMs: number;
  /** 可撤回的最后一次评分（结束页手滑救回）；null = 无可撤回 */
  undoLast: { rating: GradeValue } | null;
  onUndoLast: () => void;
  onRestart: () => void;
  onHome: () => void;
  onExit: () => void;
  practiceOnly: boolean;
}) {
  const accuracy = stats.answered > 0 ? Math.round(((stats.answered - stats.again) / stats.answered) * 100) : 0;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  const [now, setNow] = useState(0);
  const leechThreshold = studyConfigOf(book).leechThreshold;
  const leeches = book.entries.filter((entry) => leechInfoOf(entry, now, leechThreshold).lapses >= leechThreshold);
  // 会话结束：立即把本轮学习进度推给云端（静默；自动同步开启时才实际发生）
  useEffect(() => {
    if (!practiceOnly) requestSyncNow({ silent: true });
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(raf);
  }, [practiceOnly]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-200 px-4 py-8">
      <Card className="w-full max-w-md space-y-6 p-7">
        <div className="text-center">
          <div className="text-[40px] leading-none">🎉</div>
          <div className="t-h-20 mt-3">{practiceOnly ? "自由练习完成" : "本轮学习完成"}</div>
          <div className="t-label-13 mt-1.5 text-gray-800">
            {book.name} · {practiceOnly ? "不计入每日目标，未改变复习计划" : `用时 ${minutes > 0 ? `${minutes} 分 ` : ""}${seconds} 秒`}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SummaryRow label="复习卡片" value={String(stats.answered)} />
          <SummaryRow label="正确率" value={`${accuracy}%`} />
          <SummaryRow label="记得 / 轻松" value={`${stats.good} / ${stats.easy}`} />
          <SummaryRow label="模糊 / 忘记" value={`${stats.hard} / ${stats.again}`} />
        </div>
        {leeches.length ? (
          <div className="space-y-2 border-t border-gray-300 pt-4">
            <div className="t-label-13 font-medium text-gray-900">顽固词 · {leeches.length}</div>
            <div className="space-y-1.5">
              {leeches.slice(0, 5).map((entry) => {
                const info = leechInfoOf(entry, now, leechThreshold);
                return (
                  <div key={entry.id} className="t-label-12 flex items-center justify-between gap-3 text-gray-800">
                    <span className="truncate text-gray-1000">{entry.headword}</span>
                    <span className="shrink-0 text-amber-900">
                      {info.level === "suspended" ? `搁置至 ${new Date(info.until!).toLocaleDateString("zh-CN")}` : `忘记 ${info.lapses} 次`}
                    </span>
                  </div>
                );
              })}
            </div>
            {leeches.length > 5 ? <div className="t-label-12 text-gray-700">还有 {leeches.length - 5} 个，可在词库筛选「顽固词」查看。</div> : null}
            <Link
              href={`/book?id=${book.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-background-100 px-3.5 t-button text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100"
            >
              回词库处理
            </Link>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2.5 border-t border-gray-300 pt-5">
          {undoLast ? (
            <Button variant="tertiary" onClick={onUndoLast}>
              <Undo2 className="size-4" /> 撤销最后一张的「{GRADE_LABEL[undoLast.rating]}」
              <Kbd className="wv-desktop-only hidden sm:inline-flex">U</Kbd>
            </Button>
          ) : null}
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
  choiceKeys,
  newStep,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: EffectiveMode;
  choiceKeys: ChoiceKeys;
  newStep: NewWordStep | null;
}) {
  const choiceItems: KeyBinding[] = [
    { label: "选择答案", keys: choiceKeys.map((k) => k.toUpperCase()), desc: "对应四个选项，直接选中即判定" },
    { label: "答对后确认", keys: ["空格", "G"], desc: "空格＝稳稳想起；G＝猜的（记模糊）" },
    ...KEYMAP_CHOICE.slice(1),
  ];
  const newWordItems: KeyBinding[] = [
    { label: "没印象 / 有印象", keys: ["F", "J"], desc: "只选择验证路径，不评分" },
    { label: "进入回忆", keys: ["空格"], desc: "教学卡看完后，开始看词说义" },
    { label: "回忆自评", keys: ["D", "F", "J"], desc: "说不出 / 想很久 / 说对了" },
  ];
  const productionItems: KeyBinding[] = [
    { label: "提交答案", keys: ["Enter"], desc: "首次提交定终身，输入法组合期间不会提交" },
    { label: "继续下一词", keys: ["空格"], desc: "提交反馈看完后继续；忘记可先放下" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="快捷键" desc="桌面端使用；移动端可直接点按操作。" />
      <DialogBody className="space-y-4">
        {newStep ? <KeySection title="新词三步流程" items={newWordItems} /> : null}
        {mode === "cloze" || mode === "spell" ? <KeySection title={mode === "cloze" ? "例句挖空" : "拼写题"} items={productionItems} /> : null}
        {mode === "flip" || mode === "choice" ? <KeySection title={mode === "choice" ? "选择题模式" : "翻卡模式"} items={mode === "choice" ? choiceItems : KEYMAP_FLIP} /> : null}
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
