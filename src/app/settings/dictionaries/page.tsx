import { SettingsShell } from "@/components/settings/SettingsShell";
import { DictionarySection } from "@/components/settings/DictionarySection";

export default function DictionariesSettingsPage() {
  return (
    <SettingsShell title="本地词库" desc="离线词典放在这台设备上；导入后检索不联网、查词在毫秒级。">
      <DictionarySection />
    </SettingsShell>
  );
}
