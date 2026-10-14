import { Suspense } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { StudySettings } from "@/components/settings/StudySettings";

export default function StudySettingsPage() {
  return (
    <SettingsShell title="学习" desc="复习节奏、选择题与键位都在这里。学习首页只保留开始学习要用的基础项。">
      <Suspense fallback={<div className="t-label-13 text-gray-800">正在载入…</div>}>
        <StudySettings />
      </Suspense>
    </SettingsShell>
  );
}
