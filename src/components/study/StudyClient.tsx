"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { studyOverview, studyStateOf } from "@/lib/study/queue";
import { batchSelectionFromParams, type BatchIntent, type BatchSelection } from "@/lib/study/batch";
import { StudySession } from "@/components/study/StudySession";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export function StudyClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const hydrated = useAppStore((s) => s.hydrated);
  const book = useAppStore((s) => s.books.find((b) => b.id === id));
  const setBookStudyState = useAppStore((s) => s.setBookStudyState);
  const batch = batchSelectionFromParams(searchParams);
  const rawIntent = searchParams.get("intent");
  const intent: BatchIntent = rawIntent === "review" || rawIntent === "cram" ? rawIntent : "new";
  const sessionBatch: BatchSelection | null = batch ?? (intent === "cram" ? { dimension: "random", size: 8 } : null);

  if (!hydrated) {
    return <div className="flex h-dvh items-center justify-center text-gray-800">正在载入…</div>;
  }
  if (!book) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <EmptyState
          title="未找到该词库"
          desc="无法开始学习。"
          action={
            <Link href="/books">
              <Button variant="secondary">返回词库列表</Button>
            </Link>
          }
        />
      </div>
    );
  }
  const state = studyStateOf(book);
  if (state !== "active" && intent !== "cram") {
    const due = studyOverview(book).due;
    const paused = state === "paused";
    return (
      <div className="flex h-dvh items-center justify-center px-4">
        <EmptyState
          title={paused ? "这个词库已暂停" : "这个词库已归档"}
          desc={
            paused
              ? `暂停期间不会计入每日目标，记忆到期时间仍会继续。${due > 0 ? `目前有 ${due} 个词到期。` : ""}`
              : "归档保留了全部内容与学习历史，恢复时可以按原计划继续，也可以重置学习记录。"
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {paused ? (
                <Button
                  onClick={() => {
                    setBookStudyState(book.id, "active");
                    toast.success(`已恢复「${book.name}」的学习`);
                  }}
                >
                  恢复学习
                </Button>
              ) : (
                <Link href="/books">
                  <Button>去词库列表恢复</Button>
                </Link>
              )}
              <Link href="/books">
                <Button variant="secondary">返回词库列表</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }
  return <StudySession book={book} batch={sessionBatch} intent={sessionBatch ? intent : undefined} />;
}
