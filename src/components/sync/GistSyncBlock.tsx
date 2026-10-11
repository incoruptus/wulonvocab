"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Cloud, Copy, KeyRound, RefreshCw } from "lucide-react";
import { loadSyncMeta, saveSyncMeta } from "@/lib/sync/meta";
import { generatePairCode, isPairCodeWellFormed, normalizePairCode } from "@/lib/sync/crypto";
import { markSyncIdle, markSyncOff, runGistSync, subscribeSyncStatus, type SyncStatus } from "@/lib/sync/engine";
import { syncDeps } from "@/components/sync/syncDeps";
import type { SyncMeta } from "@/lib/sync/types";
import { Button, IconButton } from "@/components/ui/button";
import { Input, SwitchRow } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { formatDateTime } from "@/lib/utils";
import { SyncGuideDialog } from "@/components/sync/SyncGuideDialog";

const PHASE_META: Record<SyncStatus["phase"], { label: string; variant: "gray" | "blue" | "green" | "amber" }> = {
  off: { label: "未开启", variant: "gray" },
  idle: { label: "待同步", variant: "gray" },
  syncing: { label: "同步中…", variant: "blue" },
  ok: { label: "已同步", variant: "green" },
  error: { label: "需要处理", variant: "amber" },
};

/**
 * 自动同步（GitHub Gist 档 · P1）配置卡：
 * 配对码 + Token 一次配置；实际调度由根布局的 SyncAutoProvider 全局常驻执行
 * （打开应用 / 切回前台 / 联网 / 每 30 分钟），本卡只负责配置、状态展示与手动触发。
 */
export function GistSyncBlock() {
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [status, setStatus] = useState<SyncStatus>({ phase: "off", at: null });
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "regen" | "newgist" }>(null);

  const refresh = useCallback(async () => {
    const m = await loadSyncMeta();
    setMeta(m);
    setTokenDraft(m.gist?.token ?? "");
    setCodeDraft(m.gist?.pairCode ?? "");
    return m;
  }, []);

  useEffect(() => {
    let alive = true;
    void loadSyncMeta().then((m) => {
      if (!alive) return;
      setMeta(m);
      setTokenDraft(m.gist?.token ?? "");
      setCodeDraft(m.gist?.pairCode ?? "");
    });
    const unsub = subscribeSyncStatus((s) => {
      setStatus(s);
      if (s.phase === "ok") {
        void loadSyncMeta().then((m) => {
          if (alive) setMeta(m);
        });
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const gist = meta?.gist ?? null;
  const configured = Boolean(gist?.token && gist.pairCode && isPairCodeWellFormed(gist.pairCode));
  const hasGistConfig = Boolean(gist);

  // 徽标语义：已配置 → 待同步；配置过但关掉 → 未开启
  useEffect(() => {
    if (configured) markSyncIdle();
    else if (hasGistConfig) markSyncOff();
  }, [configured, hasGistConfig]);

  const kick = useCallback(async (manual: boolean) => {
    if (manual) setBusy(true);
    try {
      const out = await runGistSync(syncDeps, { manual });
      if (manual) {
        const parts: string[] = [];
        const a = out.applied;
        if (a) {
          parts.push(`新增 ${a.booksAdded + a.entriesAdded} · 更新 ${a.booksUpdated + a.entriesUpdated} · 删除 ${a.booksDeleted + a.entriesDeleted}`);
        }
        if (out.conflicts) parts.push(`${out.conflicts} 处冲突按较新保留`);
        toast.success(out.pulled || out.pushed ? "同步完成" : "已经是最新", {
          description: parts.join(" · ") || undefined,
        });
      }
    } catch (e) {
      if (manual) toast.error(`同步失败：${(e as Error).message}`);
    } finally {
      if (manual) setBusy(false);
    }
  }, []);

  const patchGist = async (patch: Partial<NonNullable<SyncMeta["gist"]>>) => {
    const m = await loadSyncMeta();
    const base = m.gist ?? { enabled: false, token: "", gistId: null, pairCode: "", lastPushHash: null };
    await saveSyncMeta({ gist: { ...base, ...patch } });
    await refresh();
  };

  const copyCode = async () => {
    if (!codeDraft) return;
    try {
      await navigator.clipboard.writeText(codeDraft);
      toast.success("配对码已复制——发给要同步的设备（有几台发几台）");
    } catch {
      toast.info("复制失败，请手动选中复制");
    }
  };

  const statusMeta = PHASE_META[status.phase];

  return (
    <div className="space-y-3 rounded-lg bg-background-200 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Cloud className="size-4 text-gray-800" />
        <span className="t-label-13 font-medium text-gray-1000">自动同步 · GitHub Gist</span>
        <Badge variant={statusMeta.variant} size="sm">
          {statusMeta.label}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="tertiary" size="sm" onClick={() => setGuideOpen(true)}>
            <BookOpen className="size-3.5" /> 同步向导
          </Button>
        </div>
      </div>

      <p className="t-label-12 text-gray-700">
        借你 GitHub 账号里的免费 Gist 当私密中转站：内容先用配对码加密再上传，中转站看到的只是密文。
        多台设备？同一对 Token + 配对码照配一遍，几台都行。不想用 GitHub？用上面的「同步包」手动搬一次，也一样能对齐。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 配对码 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-gray-800" />
            <span className="t-label-13 font-medium text-gray-900">配对码</span>
            {codeDraft ? (
              isPairCodeWellFormed(codeDraft) ? null : <Badge variant="amber" size="sm">格式待确认</Badge>
            ) : (
              <Badge variant="gray" size="sm">未设置</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
              onBlur={() => codeDraft && codeDraft !== gist?.pairCode && void patchGist({ pairCode: normalizePairCode(codeDraft) })}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              className="font-mono text-[13px] tracking-wide"
            />
            <IconButton label="复制配对码" onClick={() => void copyCode()} disabled={!codeDraft}>
              <Copy className="size-3.5" />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "regen" })}>
              <RefreshCw className="size-3.5" /> 生成新码
            </Button>
            <span className="t-label-12 text-gray-700">同一串码配到每台设备——两台、三台都互解</span>
          </div>
        </div>

        {/* Token 与仓库 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Cloud className="size-3.5 text-gray-800" />
            <span className="t-label-13 font-medium text-gray-900">GitHub Token</span>
            {gist?.token ? <Badge variant="green" size="sm">已保存</Badge> : <Badge variant="gray" size="sm">未设置</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="ghp_… 或 github_pat_…"
              className="font-mono text-[13px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!tokenDraft || tokenDraft === gist?.token}
              onClick={() => void patchGist({ token: tokenDraft.trim() }).then(() => toast.success("Token 已保存（只留在这台设备）"))}
            >
              保存
            </Button>
          </div>
          <div className="t-label-12 text-gray-700">
            {gist?.gistId ? (
              <>
                已连接仓库 {gist.gistId.slice(0, 8)}…{" "}
                <button type="button" className="underline underline-offset-2 hover:text-gray-900" onClick={() => setConfirm({ kind: "newgist" })}>
                  重新创建
                </button>
              </>
            ) : (
              "第一次同步时，会自动在你账号下创建私有 Gist"
            )}
          </div>
        </div>
      </div>

      <SwitchRow
        label="自动同步"
        hint="打开应用、切回前台、恢复联网、每 30 分钟自动对账"
        checked={Boolean(gist?.enabled)}
        onCheckedChange={(v) => void patchGist({ enabled: v })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void kick(true)} loading={busy || status.phase === "syncing"} disabled={!configured}>
          <RefreshCw className="size-3.5" /> 立即同步
        </Button>
        <span className="t-label-12 text-gray-700">
          {status.phase === "error" && status.message ? (
            <span className="text-amber-900">{status.message}</span>
          ) : meta?.lastSyncAt ? (
            `上次同步 ${formatDateTime(meta.lastSyncAt)}`
          ) : configured ? (
            "还没有同步过"
          ) : (
            "配置好 Token 与配对码即可开始"
          )}
        </span>
      </div>

      <SyncGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      <Dialog open={Boolean(confirm)} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogHeader
          title={confirm?.kind === "regen" ? "生成新的配对码？" : "重新创建同步仓库？"}
          desc={
            confirm?.kind === "regen"
              ? "其他设备需要用新码重新配对才能继续同步；旧内容不会丢。"
              : "会在你的 GitHub 上新建一个 Gist；旧的不会被删除，可自行清理。"
          }
        />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            {confirm?.kind === "regen"
              ? "确认后会生成一串新码并替换旧码；每台设备下次同步前需要粘贴新码。"
              : "确认后清除当前仓库连接，下次同步将在你的 GitHub 上创建新的 Gist。"}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            取消
          </Button>
          <Button
            onClick={() => {
              const kind = confirm?.kind;
              setConfirm(null);
              if (kind === "regen") {
                const code = generatePairCode();
                void patchGist({ pairCode: code, lastPushHash: null }).then(() => toast.success("新配对码已生成——记得复制给每一台设备"));
              } else {
                void patchGist({ gistId: null, lastPushHash: null }).then(() => toast.success("下次同步会创建新的 Gist"));
              }
            }}
          >
            确认
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
