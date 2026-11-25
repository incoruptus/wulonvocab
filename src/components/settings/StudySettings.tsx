"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { choiceKeyPresetOf, CHOICE_KEY_PRESETS, normalizeChoiceKeys, validateChoiceKeys } from "@/lib/study/keys";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, SwitchRow } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardTitle, SegmentedControl } from "@/components/ui/misc";
import { normalizePublicQuizBankUrl } from "@/lib/study/quizBankUrl";

/** 跨词库通用学习偏好；按词库参数已迁入词库工作区。 */
export function StudySettings() {
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryBookId = searchParams.get("book") ?? "";

  // 旧深链兼容：直接进入对应词库的复习参数页。
  useEffect(() => {
    if (!hydrated || !queryBookId) return;
    if (useAppStore.getState().books.some((book) => book.id === queryBookId)) {
      router.replace(`/book?id=${encodeURIComponent(queryBookId)}&tab=study`);
    }
  }, [hydrated, queryBookId, router]);

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

  return (
    <Card className="space-y-4">
      <CardTitle desc="对所有词库通用，会随跨端同步。按词库参数请在词库工作区的「复习参数」页调整。">通用学习偏好</CardTitle>
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
                  const result = validateChoiceKeys(keyDraft);
                  if (result.ok) {
                    setSettings({ choiceKeys: [...result.keys] });
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
      <div className="space-y-1.5 border-t border-gray-300 pt-3.5">
        <div className="t-label-13 font-medium text-gray-900">公共选择题题库</div>
        <Input
          type="url"
          defaultValue={settings.quizBankUrl ?? ""}
          placeholder="https://gist.githubusercontent.com/…/manifest.json"
          onBlur={(event) => {
            const normalized = normalizePublicQuizBankUrl(event.target.value);
            if (normalized === null) {
              toast.error("题库清单地址必须使用 HTTPS，且格式正确");
              event.target.value = settings.quizBankUrl ?? "";
              return;
            }
            event.target.value = normalized;
            if (normalized !== (settings.quizBankUrl ?? "")) setSettings({ quizBankUrl: normalized || undefined });
          }}
        />
        <p className="t-label-12 text-gray-700">匿名读取公共 Gist 的清单与分片，不需要 GitHub Token。留空仍可使用个人题库、内置编辑题、AI 与本机缓存；分层选择在词库工作区的「题库」页。</p>
      </div>
    </Card>
  );
}
