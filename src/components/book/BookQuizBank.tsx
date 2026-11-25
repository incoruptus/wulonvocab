"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Entry, Wordbook } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { studyConfigOf } from "@/lib/study/queue";
import { firstDefinition, firstTranslation, validateQuizQuestion, type QuizOption } from "@/lib/study/quiz";
import { buildPublicQuizBankFile, mergePersonalQuizQuestions, type PersonalQuizQuestion } from "@/lib/study/quizBank";
import { SAMPLE_QUIZ_QUESTIONS } from "@/lib/study/sampleQuizBank";
import { normalizePublicQuizBankUrl } from "@/lib/study/quizBankUrl";
import type { ChoiceQuizKind, StudyConfig } from "@/lib/study/types";
import { downloadText, uid } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card, CardTitle, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";

const KIND_LABEL: Record<ChoiceQuizKind, string> = {
  word2def: "看词选英文释义",
  def2word: "看英文释义选英文词",
  zh2word: "看中文释义选英文词",
  word2zh: "看词选中文释义",
};
const KINDS = Object.keys(KIND_LABEL) as ChoiceQuizKind[];

function draftFor(entry: Entry, kind: ChoiceQuizKind): PersonalQuizQuestion {
  const definition = firstDefinition(entry);
  const translation = firstTranslation(entry);
  const answer = kind === "word2def" ? definition?.text ?? "" : kind === "word2zh" ? translation?.text ?? "" : entry.headword;
  return {
    id: uid(),
    updatedAt: Date.now(),
    word: entry.headword,
    pos: translation?.pos || definition?.pos || "",
    kind,
    options: [
      { text: answer, correct: true, role: "correct" },      { text: "", correct: false, role: "confusable", note: "" },
      { text: "", correct: false, role: "contrast" },
      { text: "", correct: false, role: "contrast" },
    ],
    correctIndex: 0,
    ...(kind === "def2word" ? { clue: definition?.text ?? "" } : {}),
    ...(kind === "zh2word" ? { clue: translation?.text ?? "" } : {}),
    hideWord: kind === "def2word" || kind === "zh2word",
    source: "entry",
  };
}

export function BookQuizBank({ book }: { book: Wordbook }) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setStudyConfig = useAppStore((s) => s.setStudyConfig);
  const saveQuestion = useAppStore((s) => s.savePersonalQuizQuestion);
  const deleteQuestion = useAppStore((s) => s.deletePersonalQuizQuestion);
  const importQuestions = useAppStore((s) => s.importPersonalQuizQuestions);
  const { pending, run } = useSyncCommit();
  const cfg = studyConfigOf(book);
  const questions = useMemo(() => mergePersonalQuizQuestions([], book.personalQuizBank ?? []), [book.personalQuizBank]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PersonalQuizQuestion | null>(null);
  const [isNewQuestion, setIsNewQuestion] = useState(false);
  const [publicUrl, setPublicUrl] = useState(settings.quizBankUrl ?? "");
  const [publicAuthor, setPublicAuthor] = useState("匿名");
  const [publicLicense, setPublicLicense] = useState<"CC0-1.0" | "CC-BY-4.0">("CC0-1.0");
  const configuredPublicUrl = normalizePublicQuizBankUrl(settings.quizBankUrl ?? "") ?? settings.quizBankUrl ?? "";
  const patch = (value: Partial<StudyConfig>) => run(() => setStudyConfig(book.id, value));
  const filtered = questions.filter((question) => !query.trim() || `${question.word} ${KIND_LABEL[question.kind]}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sampleWords = new Set(book.entries.map((entry) => entry.headword.toLowerCase()));
  const availableSampleCount = SAMPLE_QUIZ_QUESTIONS.filter((question) => sampleWords.has(question.word.toLowerCase())).length;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPublicUrl(configuredPublicUrl));
    return () => cancelAnimationFrame(raf);
  }, [configuredPublicUrl]);

  const savePublicUrl = () => {
    const normalized = normalizePublicQuizBankUrl(publicUrl);
    if (normalized === null) {
      toast.error("公共题库地址必须使用 HTTPS，且格式正确");
      return;
    }
    const value = normalized;
    setPublicUrl(value);
    void run(async () => { await setSettings({ quizBankUrl: value || undefined }); return true; });
    toast.success(value ? "已启用为公共题库" : "已停用公共题库");
  };

  const submitQuestion = () => {
    if (!editing) return;
    const entry = book.entries.find((item) => item.headword.toLowerCase() === editing.word.toLowerCase());
    if (!entry) {
      toast.error("请选择本词库中的单词");
      return;
    }
    const translation = firstTranslation(entry);
    const definition = firstDefinition(entry);
    const validated = validateQuizQuestion(editing, {
      word: entry.headword,
      pos: editing.pos,
      kind: editing.kind,
      translation: translation?.text,
      definition: definition?.text,
    });
    if (!validated) {
      toast.error("题目未通过校验：检查四个选项、唯一答案、易混项说明与词条义项是否一致");
      return;
    }
    saveQuestion(book.id, { ...editing, ...validated });
    setEditing(null);
    toast.success("个人题目已保存，并随词库同步");
  };

  const updateOption = (index: number, patchOption: Partial<QuizOption>) => {
    if (!editing) return;
    const options = editing.options.map((option, i) => i === index ? { ...option, ...patchOption } : option);
    if (patchOption.correct) {
      for (let i = 0; i < options.length; i += 1) options[i] = { ...options[i], correct: i === index, role: i === index ? "correct" : options[i].role === "correct" ? "contrast" : options[i].role };
    }
    setEditing({ ...editing, options });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 pb-8 sm:p-5">
      <div>
        <h2 className="t-h-16 text-gray-1000">选择题题库</h2>
        <p className="t-label-13 mt-1 text-gray-800">公共题库匿名只读；个人题库归本词库所有，可编辑并随词库同步。</p>
      </div>

      <Card className="space-y-4">
        <CardTitle desc="决定当前词库先从哪一层取题。个人优先时，个人题命中后会使用个人版本。">题库分层</CardTitle>
        <SegmentedControl<NonNullable<StudyConfig["quizBankSource"]>>
          value={cfg.quizBankSource ?? "public"}
          disabled={pending}
          onValueChange={(quizBankSource) => patch({ quizBankSource })}
          options={[
            { value: "public", label: "公共题库" },
            { value: "personal", label: "个人题库" },
            { value: "both", label: "两层（个人优先）" },
          ]}
          grow
        />
        <div className="space-y-1.5">
          <label htmlFor="public-quiz-bank-url" className="t-label-13 block font-medium text-gray-900">公共题库地址</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="public-quiz-bank-url" type="url" value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} placeholder="https://gist.githubusercontent.com/…/raw/…json" />
            <Button variant="secondary" disabled={pending} onClick={savePublicUrl}>一键设置为公共题库</Button>
          </div>
          <p className="t-label-12 text-gray-800">支持 64 分片清单，也支持单文件公共题库。地址只保存配置，不保存任何凭据。</p>
        </div>
        <div className="t-label-12 leading-5 text-gray-700">
          <p>当前公共地址：</p>
          <p className="mt-1 break-all text-gray-800">{configuredPublicUrl || "未配置"}</p>
          <p className="mt-1.5">没有命中题目时，再使用内置编辑题、显式开启的 AI 与词条字段。</p>
        </div>
      </Card>

      <Card className="space-y-4">
        <CardTitle desc={`${questions.length} 道个人题。只显示当前词条中能用到的题目，保存前会再次校验。`} right={
          <Button size="sm" disabled={!book.entries.length} title={!book.entries.length ? "请先添加词条" : undefined} onClick={() => {
            setIsNewQuestion(true);
            setEditing(draftFor(book.entries[0], "word2def"));
          }}>
            <Plus className="size-3.5" /> 新建题目
          </Button>
        }>个人题库</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选单词或题型…" className="h-8 flex-1 text-[13px]" />
          <Button size="sm" variant="secondary" disabled={!availableSampleCount || pending} onClick={() => {
            importQuestions(book.id, SAMPLE_QUIZ_QUESTIONS.filter((question) => sampleWords.has(question.word.toLowerCase())));
            toast.success(`已导入 ${availableSampleCount} 道示例题`);
          }}><FileUp className="size-3.5" /> 导入示例题</Button>
          <Button size="sm" variant="secondary" disabled={!questions.length} onClick={() => downloadText(`${book.name}-个人题库.json`, JSON.stringify({ format: "wulonvocab-personal-quiz-bank", version: 1, questions }, null, 2))}>
            <Download className="size-3.5" /> 导出
          </Button>
          <Button size="sm" disabled={!questions.length} onClick={() => {
            downloadText("wulonvocab-public-bank.json", JSON.stringify(buildPublicQuizBankFile(questions, { author: publicAuthor, license: publicLicense }), null, 2));
            toast.success("公共题库文件已生成，上传为一个公开 Gist 文件后即可粘贴 Raw 地址");
          }}>一键生成公共题库</Button>
        </div>
        <div className="grid gap-3 border-t border-gray-300 pt-3.5 sm:grid-cols-2">
          <Field label="公共题署名"><Input value={publicAuthor} onChange={(event) => setPublicAuthor(event.target.value)} placeholder="匿名或你的名字" /></Field>
          <Field label="公开许可" hint="生成文件时写入每道题，发布后请按所选许可共享。">
            <Select value={publicLicense} onValueChange={(value) => setPublicLicense(value as typeof publicLicense)} options={[{ value: "CC0-1.0", label: "CC0-1.0" }, { value: "CC-BY-4.0", label: "CC-BY-4.0" }]} />
          </Field>
        </div>
        {filtered.length ? (
          <div className="divide-y divide-gray-300">
            {filtered.map((question) => (
              <div key={question.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="t-label-14 font-medium text-gray-1000">{question.word}</span>
                    <Badge size="sm" variant="blue">{KIND_LABEL[question.kind]}</Badge>
                  </div>
                  <p className="t-label-12 mt-1 truncate text-gray-700">{question.kind === "def2word" || question.kind === "zh2word" ? question.clue : question.options.find((option) => option.correct)?.text}</p>
                </div>
                <IconButton label="编辑题目" onClick={() => {
                  setIsNewQuestion(false);
                  setEditing({ ...question, options: question.options.map((option) => ({ ...option })) });
                }}><Pencil className="size-3.5" /></IconButton>
                <IconButton label="删除题目" onClick={() => {
                  deleteQuestion(book.id, question.id);
                  toast.success("个人题目已删除");
                }}><Trash2 className="size-3.5" /></IconButton>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={questions.length ? "没有匹配的题目" : "个人题库还是空的"} desc={book.entries.length ? "可新建题目，或把内置示例十词的 40 道编辑题导入当前词库。" : "请先添加词条，再为具体单词新建题目。"} />
        )}
      </Card>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        widthClass="max-w-2xl"
        mobileFull
      >
        <DialogHeader
          title={isNewQuestion ? "新建个人题目" : "编辑个人题目"}
          desc="四个选项、一个正确答案、1–2 个易混项；易混项必须写清与答案的关键差异。"
        />
        <DialogBody>
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="单词">
                  <Select value={editing.word} onValueChange={(word) => {
                    const entry = book.entries.find((item) => item.headword === word);
                    if (entry) setEditing({ ...draftFor(entry, editing.kind), id: editing.id });
                  }} options={book.entries.map((entry) => ({ value: entry.headword, label: entry.headword }))} />
                </Field>
                <Field label="题型">
                  <Select value={editing.kind} onValueChange={(kind) => {
                    const entry = book.entries.find((item) => item.headword === editing.word);
                    if (entry) setEditing({ ...draftFor(entry, kind as ChoiceQuizKind), id: editing.id });
                  }} options={KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))} />
                </Field>
              </div>
              <Field label="词性"><Input value={editing.pos} onChange={(event) => setEditing({ ...editing, pos: event.target.value })} placeholder="v. / adj. / n." /></Field>
              {editing.clue !== undefined ? <Field label="正面线索" hint="自动读取词条义项，确保与答案一致。"><Input value={editing.clue} readOnly /></Field> : null}
              <div className="space-y-2.5">
                {editing.options.map((option, index) => (
                  <div key={index} className="rounded-lg bg-background-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="t-mono-12 text-gray-700">选项 {index + 1}</span>
                      <Button size="sm" variant={option.correct ? "default" : "secondary"} onClick={() => updateOption(index, { correct: true })}>{option.correct ? "正确答案" : "设为正确"}</Button>
                      {!option.correct ? (
                        <Select size="sm" className="w-28" value={option.role} onValueChange={(role) => updateOption(index, { role: role as QuizOption["role"] })} options={[{ value: "confusable", label: "易混项" }, { value: "contrast", label: "对照项" }]} />
                      ) : null}
                    </div>
                    <Input value={option.text} onChange={(event) => updateOption(index, { text: event.target.value })} placeholder={editing.kind === "word2def" || editing.kind === "def2word" ? "英文释义或单词" : "中文释义或单词"} />
                    {option.role === "confusable" && !option.correct ? <Input className="mt-2" value={option.note ?? ""} onChange={(event) => updateOption(index, { note: event.target.value })} placeholder="与正确答案的关键差异" /> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
          <Button onClick={submitQuestion}>保存题目</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
