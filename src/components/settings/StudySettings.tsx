"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { studyConfigOf } from "@/lib/study/queue";
import type { StudyConfig } from "@/lib/study/types";
import { choiceKeyPresetOf, CHOICE_KEY_PRESETS, normalizeChoiceKeys, validateChoiceKeys } from "@/lib/study/keys";
import { useAppStore } from "@/lib/store";
import { useSyncCommit } from "@/components/app/useSyncCommit";
import { Button } from "@/components/ui/button";
import { Field, Input, SwitchRow } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Card, CardTitle, EmptyState, SegmentedControl } from "@/components/ui/misc";

/**
 * 学习设置（设置 → 学习）：
 * - 通用学习偏好：对所有词库生效（退出去向、直选键位），随跨端同步；
 * - 复习参数（按词库）：保持率 / 新词引入顺序 / 复习排序 / 选择题题型 / 推进方式 / 相似词避让，改的是选中的词库；
 *   从学习首页进入时带 ?book=<id> 深链，直接落在当前词库。
 * 学习首页只保留基础项（模式 / 新词上限 / 顺序 / 本场相似 / 发音）。
 */
export function StudySettings() {
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const books = useAppStore((s) => s.books);
  const setStudyConfig = useAppStore((s) => s.setStudyConfig);
  const { pending: configPending, run: runConfig } = useSyncCommit();

  const [picked, setPicked] = useState("");
  // 深链 ?book= 优先（从学习首页进入时带上当前词库）；之后以选择器为准
  const searchParams = useSearchParams();
  const queryBookId = searchParams.get("book") ?? "";
  const activeId = picked || queryBookId || settings.lastBookId || "";
  const book = books.find((b) => b.id === activeId) ?? books[0] ?? null;

  // 直选键位（WEIO / ABCD / 自定义；自定义草稿本地校验）
  const choiceKeys = useMemo(() => normalizeChoiceKeys(settings.choiceKeys), [settings.choiceKeys]);
  const [customKeysMode, setCustomKeysMode] = useState(false);
  const [keyDraft, setKeyDraft] = useState<string[]>([]);
  const keyMode: "weio" | "abcd" | "custom" = customKeysMode ? "custom" : choiceKeyPresetOf(choiceKeys);
  const keyCheck = customKeysMode ? validateChoiceKeys(keyDraft) : ({ ok: true } as const);
  const keyError = keyCheck.ok ? null : keyCheck.error;

  if (!hydrated) {
    return (
      <Card>
        <p className="t-label-13 text-gray-800">正在载入…</p>
      </Card>
    );
  }

  const cfg = book ? studyConfigOf(book) : null;
  const patch = (p: Partial<StudyConfig>) => {
    if (!book) return;
    runConfig(() => setStudyConfig(book.id, p));
  };

  return (
    <>
      <Card className="space-y-4">
        <CardTitle desc="对所有词库通用，会随跨端同步。">通用学习偏好</CardTitle>
        <div className="space-y-1.5">
          <div className="t-label-13 font-medium text-gray-900">关闭学习后去往</div>
          <Select
            value={settings.studyExit ?? "book"}
            onValueChange={(v) => setSettings({ studyExit: v as "book" | "learn" | "back" })}
            options={[
              { value: "book", label: "词库页（默认）" },
              { value: "learn", label: "学习中心" },
              { value: "back", label: "返回上一页" },
            ]}
          />
          <p className="t-label-12 text-gray-700">「返回上一页」在没有上一页时会回到词库页。退出时仍可选择保留或放弃本轮进度。</p>
        </div>
        <div className="grid gap-3 border-t border-gray-300 pt-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">每日有效提取目标</div>
            <Select
              value={settings.goalTier ?? "target"}
              onValueChange={(v) => setSettings({ goalTier: v as "light" | "target" | "challenge" })}
              options={[
                { value: "light", label: "下限 · 20 次" },
                { value: "target", label: "目标 · 40 次（推荐）" },
                { value: "challenge", label: "挑战 · 60 次" },
              ]}
            />
            <p className="t-label-12 text-gray-700">统计每次有反馈的练习；新词首学与课后回炉都计入。</p>
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">学习日从几点开始</div>
            <Select
              value={String(settings.dayBoundaryHour ?? 4)}
              onValueChange={(v) => setSettings({ dayBoundaryHour: Number(v) })}
              options={Array.from({ length: 7 }, (_, hour) => ({ value: String(hour), label: `${hour}:00` }))}
            />
            <p className="t-label-12 text-gray-700">凌晨在这个时间之前的学习，算到前一天。</p>
          </div>
        </div>
        <SwitchRow
          label="显示连续学习天数"
          hint="每周自动宽恕一个漏学日，只恢复连续，不补学习量；关闭后仍显示「本周 5/7」备用轨道"
          checked={settings.streakEnabled !== false}
          onCheckedChange={(v) => setSettings({ streakEnabled: v })}
        />
        <div className="space-y-2.5 border-t border-gray-300 pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="t-label-13 font-medium text-gray-900">选择题直选键位（网页端）</div>
              <div className="t-label-12 text-gray-700">键盘直选四个选项；F / J / R / S / U 为会话保留键。</div>
            </div>
            <SegmentedControl
              value={keyMode}
              onValueChange={(v) => {
                if (v === "custom") {
                  setCustomKeysMode(true);
                  setKeyDraft(choiceKeys);
                  return;
                }
                setCustomKeysMode(false);
                setSettings({ choiceKeys: [...CHOICE_KEY_PRESETS[v as "weio" | "abcd"]] });
                toast.success(`直选键位已切换为 ${v.toUpperCase()}`);
              }}
              options={[
                { value: "weio", label: "WEIO" },
                { value: "abcd", label: "ABCD" },
                { value: "custom", label: "自定义" },
              ]}
              size="sm"
            />
          </div>
          {keyMode === "custom" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Input
                    key={i}
                    value={(keyDraft[i] ?? "").toUpperCase()}
                    onChange={(e) => {
                      const next = [...keyDraft];
                      next[i] = e.target.value.slice(-1).toLowerCase();
                      setKeyDraft(next);
                    }}
                    aria-label={`第 ${i + 1} 个选项的键位`}
                    className="t-mono-13 h-9 w-12 text-center"
                  />
                ))}
                <Button
                  size="sm"
                  disabled={Boolean(keyError)}
                  onClick={() => {
                    const r = validateChoiceKeys(keyDraft);
                    if (r.ok) {
                      setSettings({ choiceKeys: [...r.keys] });
                      toast.success("键位已保存");
                    }
                  }}
                >
                  保存键位
                </Button>
              </div>
              {keyError ? <p className="t-label-12 text-red-900">{keyError}</p> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4">
        <CardTitle desc="每个词库各自生效；这里改的是下方选中的词库。">复习参数（按词库）</CardTitle>
        {!book || !cfg ? (
          <EmptyState
            icon={<BookOpen className="size-4" />}
            title="还没有词库"
            desc="先建立一个词库，再回来调这里的复习参数。"
            action={
              <Link
                href="/books"
                className="t-label-13 inline-flex h-9 items-center gap-1.5 rounded-md bg-background-100 px-3.5 font-medium text-gray-1000 shadow-geist-border transition-colors hover:bg-gray-100"
              >
                去词库列表
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="t-label-13 font-medium text-gray-900">词库</div>
              <Combobox
                value={book.id}
                onValueChange={(v) => setPicked(v)}
                options={books.map((b) => ({ value: b.id, label: b.name, badge: `${b.entries.length} 词` }))}
                searchPlaceholder="搜索词库…"
                emptyText="没有匹配的词库"
              />
              <p className="t-label-12 text-gray-700">学习模式、每日新词上限与整队乱序在学习首页；新词引入顺序与复习排序在这里。</p>
            </div>
            <div className="space-y-1.5 border-t border-gray-300 pt-3.5">
              <div className="t-label-13 text-gray-900">记忆保持率</div>
              <SegmentedControl
                value={String(cfg.retention)}
                disabled={configPending}
                onValueChange={(v) => patch({ retention: Number(v) })}
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
            <div className="grid gap-3 border-t border-gray-300 pt-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="t-label-13 text-gray-900">新词引入顺序</div>
                <Select
                  value={cfg.newOrder}
                  disabled={configPending}
                  onValueChange={(v) => patch({ newOrder: v as StudyConfig["newOrder"] })}
                  options={[
                    { value: "list", label: "词库顺序" },
                    { value: "listDesc", label: "词库倒序" },
                    { value: "az", label: "字母 A 到 Z" },
                    { value: "azDesc", label: "字母 Z 到 A" },
                    { value: "shuffle", label: "每次会话乱序" },
                  ]}
                />
                <p className="t-label-12 text-gray-700">先按这里的顺序排好，再取当天的新词名额。字母序适合查找，默认仍用词库顺序。</p>
              </div>
              <div className="space-y-1.5">
                <div className="t-label-13 text-gray-900">复习排序</div>
                <Select
                  value={cfg.reviewOrder}
                  disabled={configPending}
                  onValueChange={(v) => patch({ reviewOrder: v as StudyConfig["reviewOrder"] })}
                  options={[
                    { value: "due", label: "到期优先" },
                    { value: "retrievability", label: "最可能忘的优先" },
                  ]}
                />
                <p className="t-label-12 text-gray-700">「最可能忘的优先」按当前记忆强度排序；相似词避让仍会生效。</p>
              </div>
            </div>
            <div className="space-y-3 border-t border-gray-300 pt-3.5">
              <div>
                <div className="t-label-13 font-medium text-gray-900">每日计划与弱词</div>
                <div className="t-label-12 mt-0.5 text-gray-700">规则档只调整今天先学什么，不改变记忆到期时间，也不调用在线模型。</div>
              </div>
              <SwitchRow
                label="按时间预算规划"
                hint="复习优先；时间不够时先减少新词，放不下的词会顺延"
                checked={cfg.adaptivePlan !== false}
                loading={configPending}
                disabled={configPending}
                onCheckedChange={(v) => patch({ adaptivePlan: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="每天可用时间">
                  <Select
                    value={String(cfg.dailyMinutes ?? 20)}
                    disabled={configPending}
                    onValueChange={(v) => patch({ dailyMinutes: Number(v) })}
                    options={[5, 10, 15, 20, 30, 45, 60, 90].map((n) => ({ value: String(n), label: `${n} 分钟` }))}
                  />
                </Field>
                <Field label="目标日期（可选）" hint="考试或重要目标前两周会进一步少学新词">
                  <Input
                    type="date"
                    value={cfg.examDate ?? ""}
                    disabled={configPending}
                    onChange={(e) => patch({ examDate: e.target.value || undefined })}
                  />
                </Field>
              </div>
              <SwitchRow
                label="弱词优先"
                hint="最近忘记、遗忘次数多或记忆强度低的词先出现，最多占本轮复习的 20%"
                checked={cfg.weakPriority !== false}
                loading={configPending}
                disabled={configPending}
                onCheckedChange={(v) => patch({ weakPriority: v })}
              />
            </div>
            <div className="space-y-2.5 border-t border-gray-300 pt-3.5">
              <div>
                <div className="t-label-13 font-medium text-gray-900">选择题</div>
                <div className="t-label-12 mt-0.5 text-gray-700">学习模式选为「选择题（四选一）」时生效；选项凑不够的词会回到翻卡。</div>
              </div>
              <div className="space-y-1.5">
                <div className="t-label-13 text-gray-900">推进方式</div>
                <SegmentedControl
                  value={cfg.choiceAdvance}
                  disabled={configPending || cfg.choiceConfidence}
                  onValueChange={(v) => patch({ choiceAdvance: v })}
                  options={[
                    { value: "auto", label: "自动下一题" },
                    { value: "continue", label: "按「继续」推进" },
                  ]}
                  grow
                />
                <p className="t-label-12 text-gray-700">
                  {cfg.choiceConfidence
                    ? "开启「稳 / 猜」确认后，答对会等你确认一次，自动推进暂不可用。"
                    : "自动模式节奏快；「继续」模式会停留展示正误，误触更少。"}
                </p>
              </div>
              <div className="space-y-0.5">
                {(
                  [
                    { k: "word2zh", label: "看词选义", hint: "显示单词，四选中文释义" },
                    { k: "zh2word", label: "看义选词", hint: "显示中文释义，四选单词（正面不显示词，作答后朗读）" },
                    { k: "def2word", label: "看释义选词", hint: "显示英英释义，四选单词（词条需带英文释义，缺了自动跳过）" },
                  ] as const
                ).map(({ k, label, hint }) => (
                  <SwitchRow
                    key={k}
                    label={label}
                    hint={hint}
                    checked={cfg.choiceTypes.includes(k)}
                    loading={configPending}
                    disabled={configPending || (cfg.choiceTypes.length === 1 && cfg.choiceTypes.includes(k))}
                    onCheckedChange={(v) => patch({ choiceTypes: v ? [...cfg.choiceTypes, k] : cfg.choiceTypes.filter((x) => x !== k) })}
                  />
                ))}
                <SwitchRow
                  label="答对后询问「稳 / 猜」"
                  hint="选中「猜」记「模糊」，比一律记「记得」更贴近真实记忆"
                  checked={cfg.choiceConfidence}
                  loading={configPending}
                  disabled={configPending}
                  onCheckedChange={(v) => patch({ choiceConfidence: v })}
                />
              </div>
            </div>
            <div className="space-y-2.5 border-t border-gray-300 pt-3.5">
              <div>
                <div className="t-label-13 font-medium text-gray-900">提取练习</div>
                <div className="t-label-12 mt-0.5 text-gray-700">在复习与稳定期逐步加入例句挖空和拼写；新词三步流程保持不变。</div>
              </div>
              <SwitchRow
                label="例句挖空（Cloze）"
                hint="使用词条里的真实例句，最多 12 词、只挖一个空；没有合适例句时自动回退"
                checked={cfg.clozeEnabled !== false}
                loading={configPending}
                disabled={configPending}
                onCheckedChange={(v) => patch({ clozeEnabled: v })}
              />
              <SwitchRow
                label="拼写题"
                hint="稳定期按释义拼写；首次提交定终身，一个字符之差记「模糊」"
                checked={cfg.spellEnabled === true}
                loading={configPending}
                disabled={configPending}
                onCheckedChange={(v) => patch({ spellEnabled: v })}
              />
              <SwitchRow
                label="缺例句时允许 AI 补句"
                hint="默认关闭。开启后会调用已配置的 AI 源，生成句通过同一套短句规则后使用，并缓存在本机"
                checked={cfg.aiCloze === true}
                loading={configPending}
                disabled={configPending || !cfg.clozeEnabled}
                onCheckedChange={(v) => patch({ aiCloze: v })}
              />
            </div>
            <SwitchRow
              label="相似词避让"
              hint="形近、义近的词分开放，减少互相干扰（依据间隔学习研究）；想集中练易混组时可在学习首页开「本场允许相似词」"
              checked={cfg.similarityAvoid}
              loading={configPending}
              disabled={configPending}
              onCheckedChange={(v) => patch({ similarityAvoid: v })}
            />
            <div className="space-y-1.5 border-t border-gray-300 pt-3.5">
              <div className="t-label-13 text-gray-900">顽固词阈值</div>
              <Select
                value={String(cfg.leechThreshold)}
                disabled={configPending}
                onValueChange={(v) => patch({ leechThreshold: Number(v) })}
                options={[6, 8, 10, 12, 16, 20].map((n) => ({ value: String(n), label: `${n} 次${n === 8 ? "（推荐）" : ""}` }))}
              />
              <p className="t-label-12 text-gray-700">达到一半会提前提醒，达到阈值后可搁置 7 / 30 天、改卡或降级重学；不会自动停考。</p>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
