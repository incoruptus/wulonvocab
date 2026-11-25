import { Suspense } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { StudySettings } from "@/components/settings/StudySettings";

export default function StudySettingsPage() {
  return (
    <SettingsShell title="学习" desc="跨词库通用偏好、选择题键位与公共题库。按词库复习参数请在词库工作区调整。">
      <Suspense fallback={<div className="t-label-13 text-gray-800">正在载入…</div>}>
        <StudySettings />
      </Suspense>
    </SettingsShell>
  );
}
