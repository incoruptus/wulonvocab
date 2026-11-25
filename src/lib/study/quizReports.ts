import { createStore, get, set } from "idb-keyval";
import type { QuizQuestion } from "./quiz";
import { quizCacheKey } from "./quizCache";

const store = createStore("wulonvocab-quiz-reports-v1", "kv");

export interface QuizReport {
  id: string;
  questionKey: string;
  sharedId?: string;
  word: string;
  kind: QuizQuestion["kind"];
  reason: string;
  at: number;
}

export function questionReportKey(question: QuizQuestion): string {
  return question.sharedId ?? quizCacheKey({
    word: question.word,
    kind: question.kind,
    options: question.options.map((option) => option.text),
  });
}

export async function isQuestionReported(question: QuizQuestion): Promise<boolean> {
  try {
    return Boolean(await get<QuizReport>(questionReportKey(question), store));
  } catch {
    return false;
  }
}

export async function saveQuizReport(question: QuizQuestion, reason: string): Promise<QuizReport> {
  const report: QuizReport = {
    id: crypto.randomUUID(),
    questionKey: questionReportKey(question),
    sharedId: question.sharedId,
    word: question.word,
    kind: question.kind,
    reason: reason.trim(),
    at: Date.now(),
  };
  await set(report.questionKey, report, store);
  return report;
}
