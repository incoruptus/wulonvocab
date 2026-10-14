import { SettingsShell } from "@/components/settings/SettingsShell";
import { DictionarySection } from "@/components/settings/DictionarySection";

export default function DictionariesSettingsPage() {
  return (
    <SettingsShell
      title="本地词库"
      desc="离线词典放在这台设备上，下载后不联网。可一键内置 ECDICT 子集，或导入 OALD / ECDICT 等 JSON、CSV 数据集。"
    >
      <DictionarySection />
    </SettingsShell>
  );
}
