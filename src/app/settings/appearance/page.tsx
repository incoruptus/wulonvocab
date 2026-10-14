"use client";

import { useAppStore } from "@/lib/store";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AccentPicker, Card, CardTitle, SegmentedControl } from "@/components/ui/misc";

export default function AppearanceSettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  return (
    <SettingsShell title="外观" desc="明暗模式与强调色是本机偏好，不会随跨端同步改动其他设备。">
      <Card className="space-y-4">
        <CardTitle desc="界面主题与强调色">主题</CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">明暗模式</div>
            <SegmentedControl
              value={settings.theme}
              onValueChange={(v) => setSettings({ theme: v })}
              options={[
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
                { value: "system", label: "跟随系统" },
              ]}
              grow
            />
          </div>
          <div className="space-y-1.5">
            <div className="t-label-13 font-medium text-gray-900">强调色</div>
            <AccentPicker value={settings.accent} onChange={(v) => setSettings({ accent: v })} />
            <p className="t-label-12 text-gray-700">
              用于界面点缀；导出卡片的强调色在导出工作室中单独设置，两者互不影响。
            </p>
          </div>
        </div>
      </Card>
    </SettingsShell>
  );
}
