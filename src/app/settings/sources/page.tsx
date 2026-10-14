"use client";

import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { LookupKind } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SourceEditor } from "@/components/settings/SourceEditor";
import { Button } from "@/components/ui/button";

export default function SourcesSettingsPage() {
  const sources = useAppStore((s) => s.lookupSources);
  const addSource = useAppStore((s) => s.addLookupSource);
  return (
    <SettingsShell title="检索数据源" desc="多个来源同时找词，结果分好组等你挑；开关与配置会随跨端同步，密钥只保存在本机。">
      <div className="space-y-3">
        {sources.map((source) => (
          <SourceEditor key={source.id} source={source} removable={!["freedict", "localdict", "ai", "http"].includes(source.id)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { kind: "http", label: "自定义 HTTP API" },
            { kind: "ai", label: "AI 数据源" },
          ] as { kind: LookupKind; label: string }[]
        ).map((opt) => (
          <Button
            key={opt.kind}
            variant="secondary"
            size="sm"
            onClick={() => {
              addSource({
                kind: opt.kind,
                label: opt.label,
                enabled: false,
                config:
                  opt.kind === "ai"
                    ? { baseUrl: "", model: "", apiKey: "", language: "中文" }
                    : { urlTemplate: "", method: "GET", headers: "{}", resultPath: "", mapping: "{}" },
              });
              toast.success("已添加数据源，请填写配置并启用");
            }}
          >
            <Plus className="size-3.5" /> {opt.label}
          </Button>
        ))}
      </div>
    </SettingsShell>
  );
}
