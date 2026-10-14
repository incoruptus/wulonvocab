import { SettingsShell } from "@/components/settings/SettingsShell";
import { SyncSection } from "@/components/sync/SyncSection";

export default function SyncSettingsPage() {
  return (
    <SettingsShell title="跨端同步" desc="手机与电脑之间的词库、复习进度与设置对齐；传输内容始终加密。">
      <SyncSection />
    </SettingsShell>
  );
}
