import { SettingsShell } from "@/components/settings/SettingsShell";
import { BackupSection } from "@/components/settings/BackupSection";

export default function DataSettingsPage() {
  return (
    <SettingsShell title="备份与恢复" desc="词库、字段表、检索配置打包成一个 JSON；换设备、重装浏览器，原样恢复。">
      <BackupSection />
    </SettingsShell>
  );
}
