import { SettingsShell } from "@/components/settings/SettingsShell";
import { BackupSection } from "@/components/settings/BackupSection";

export default function DataSettingsPage() {
  return (
    <SettingsShell title="备份与恢复" desc="把整座工坊装进一个文件；换设备、重装浏览器，原样搬回来。">
      <BackupSection />
    </SettingsShell>
  );
}
