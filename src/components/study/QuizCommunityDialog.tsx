"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { QuizQuestion } from "@/lib/study/quiz";
import { buildQuizContribution } from "@/lib/study/quizBank";
import { saveQuizReport } from "@/lib/study/quizReports";
import { downloadText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";

export type QuizCommunityMode = "report" | "contribute" | null;

export function QuizCommunityDialog({
  open,
  onOpenChange,
  mode,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: QuizCommunityMode;
  question: QuizQuestion | null;
}) {
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState("匿名");
  const [license, setLicense] = useState<"" | "CC0-1.0" | "CC-BY-4.0">("");
  const [saving, setSaving] = useState(false);
  const contribution = question && mode === "contribute" && license
    ? buildQuizContribution(question, { author, license })
    : "";

  const close = () => {
    setReason("");
    setLicense("");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open && Boolean(question)} onOpenChange={(value) => value ? undefined : close()}>
      <DialogHeader
        title={mode === "report" ? "举报这道题" : "导出公共题库贡献包"}
        desc={question ? `${question.word} · ${question.pos || "未标注词性"}` : ""}
      />
      <DialogBody className="space-y-4">
        {mode === "report" ? (
          <>
            <Field label="问题说明" hint="例如：有两个答案、释义不准确、易混项其实也正确。举报后这道题会在本机隔离。">
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请说明具体问题" />
            </Field>
            <p className="t-label-12 text-gray-700">举报只记录题目 ID、版本与你的说明，不包含学习记录或词库内容。公共仓库开放后可按贡献流程提交。</p>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="署名">
                <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="匿名" />
              </Field>
              <Field label="公开许可" hint="由你明确选择，应用不会默认代替你放弃权利。">
                <Select
                  value={license}
                  onValueChange={(value) => setLicense(value as "" | "CC0-1.0" | "CC-BY-4.0")}
                  options={[
                    { value: "", label: "请选择" },
                    { value: "CC0-1.0", label: "CC0 · 放弃著作权" },
                    { value: "CC-BY-4.0", label: "CC BY · 保留署名" },
                  ]}
                />
              </Field>
            </div>
            <p className="t-label-12 text-gray-700">贡献包只含这道题与署名。下载后可提交到公共题库仓库；应用内直接上传将在 GitHub OAuth 应用注册后开放。</p>
            {contribution ? (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background-200 p-3 t-mono-12 text-gray-800">{contribution}</pre>
            ) : null}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close}>取消</Button>
        {mode === "report" ? (
          <Button
            disabled={!reason.trim() || saving}
            onClick={async () => {
              if (!question || !reason.trim()) return;
              setSaving(true);
              try {
                await saveQuizReport(question, reason);
                toast.success("已记录举报，这道题会在本机隔离");
                close();
              } catch {
                toast.error("举报保存失败，请重试");
                setSaving(false);
              }
            }}
          >
            保存举报
          </Button>
        ) : (
          <Button
            disabled={!question || !license}
            onClick={() => {
              if (!question || !contribution) return;
              downloadText(`wulonvocab-quiz-${question.word.replace(/[^a-z0-9]+/gi, "-")}.json`, contribution);
              toast.success("贡献包已下载");
              close();
            }}
          >
            下载 JSON
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
