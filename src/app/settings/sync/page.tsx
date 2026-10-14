import { SettingsShell } from "@/components/settings/SettingsShell";
import { SyncSection } from "@/components/sync/SyncSection";

export default function SyncSettingsPage() {
  return (
    <SettingsShell
      title="跨端同步"
      desc="换设备接着学：设置一次自动同步，多端自动对齐；也可以用同步包或面对面直传。删除、学习进度与偏好（外观除外）都会对上。"
    >
      <SyncSection />
    </SettingsShell>
  );
}
