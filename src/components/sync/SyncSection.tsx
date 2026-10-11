"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Share2, Smartphone } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { loadSyncMeta, saveSyncMeta, writeSafetySnapshot } from "@/lib/sync/meta";
import { exportSyncFile, importSyncFile } from "@/lib/sync/transports/file";
import { mergeSync } from "@/lib/sync/merge";
import type { MergeResult, SyncMeta, SyncPayloadV1 } from "@/lib/sync/types";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, CardTitle } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { GistSyncBlock } from "@/components/sync/GistSyncBlock";
import { requestSyncSoon } from "@/lib/sync/auto";
import { cx, downloadText, formatDateTime } from "@/lib/utils";

interface PendingImport {
  payload: SyncPayloadV1;
  now: number;
  fileName: string;
}

/**
 * 跨端同步（P0 手动档）：
 * 导出/分享 `.wulonsync` 同步包 → 另一台「导入」→ 合并预览（冲突可翻转）→ 应用。
 * 合并前自动安全快照；同步元数据独立存储，不进主库、不随包传播。
 */
export function SyncSection() {
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "local" | "remote">>({});
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadSyncMeta().then((m) => {
      if (!alive) return;
      setMeta(m);
      setNameDraft(m.device.name);
    });
    return () => {
      alive = false;
    };
  }, []);

  const syncState = () => {
    const s = useAppStore.getState();
    return { books: s.books, settings: s.settings, lookupSources: s.lookupSources, dictionaries: s.dictionaries };
  };

  const buildFile = () => {
    if (!meta) throw new Error("同步元数据尚未就绪");
    return exportSyncFile(syncState(), meta);
  };

  const doExport = () => {
    try {
      const { filename, text } = buildFile();
      downloadText(filename, text, "application/json");
      toast.success("同步包已导出", { description: "把它带到另一台设备，从「导入同步包」进入" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doShare = async () => {
    try {
      const { filename, text } = buildFile();
      const file = new File([text], filename, { type: "application/json" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "WulonVocab 同步包" });
        return;
      }
      downloadText(filename, text, "application/json");
      toast.info("当前浏览器不支持直接分享，已改为下载同步包");
    } catch {
      /* 分享被取消：静默 */
    }
  };

  const onPickFile = async (file: File) => {
    try {
      const text = await file.text();
      const { payload } = importSyncFile(text);
      setResolutions({});
      setPending({ payload, now: Date.now(), fileName: file.name });
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`);
    }
  };

  const mergeResult: MergeResult | null = useMemo(() => {
    if (!pending || !meta) return null;
    return mergeSync({
      local: syncState(),
      remote: pending.payload,
      meta: {
        base: meta.base,
        lastSyncAt: meta.lastSyncAt,
        localDeviceId: meta.device.id,
        remoteDeviceId: pending.payload.deviceId,
        tombstones: meta.tombstones,
        now: pending.now,
      },
      resolutions,
    });
    // 重算时机：导入内容、元数据或人工裁决变化时；store 状态以导入那一刻为准
  }, [pending, meta, resolutions]);

  const applyMerge = async () => {
    if (!pending || !mergeResult || !meta) return;
    setApplying(true);
    try {
      // 安全快照（保留最近 3 份）
      await writeSafetySnapshot(JSON.stringify({ state: syncState(), tombstones: meta.tombstones, at: Date.now() }));
      useAppStore.getState().applySyncState(mergeResult.state);
      await saveSyncMeta({
        lastSyncAt: Date.now(),
        base: mergeResult.nextBase,
        tombstones: mergeResult.nextTombstones,
      });
      const a = mergeResult.applied;
      toast.success("同步完成", {
        description: `新增 ${a.booksAdded + a.entriesAdded} · 更新 ${a.booksUpdated + a.entriesUpdated} · 删除 ${a.booksDeleted + a.entriesDeleted}`,
      });
      requestSyncSoon(10_000); // 手动合并后顺手推一轮，让下一台设备更快拿到
      setPending(null);
      const fresh = await loadSyncMeta();
      setMeta(fresh);
    } catch (e) {
      toast.error(`合并失败：${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  const saveName = async () => {
    if (!meta) return;
    const name = nameDraft.trim() || meta.device.name;
    await saveSyncMeta({ device: { ...meta.device, name } });
    setMeta({ ...meta, device: { ...meta.device, name } });
    toast.success("设备名已保存");
  };

  const selfPack = pending && meta && pending.payload.deviceId === meta.device.id;

  return (
    <Card className="space-y-4">
      <CardTitle desc="两种搬运方式：①「同步包」手动带一次（零配置）；②「自动同步」设置一次后自动对账。删除、学习进度与设置都会对上。">
        <span className="inline-flex items-center gap-2">
          <Smartphone className="size-4 text-gray-800" /> 跨端同步
        </span>
      </CardTitle>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="t-label-13 font-medium text-gray-900">这台设备</div>
          <div className="flex items-center gap-2">
            <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="给设备起个名字" />
            <Button variant="secondary" size="sm" onClick={() => void saveName()} disabled={!meta}>
              保存
            </Button>
          </div>
          <div className="t-label-12 text-gray-700">
            设备码 {meta ? meta.device.id.slice(0, 8) : "…"} · 上次同步 {meta?.lastSyncAt ? formatDateTime(meta.lastSyncAt) : "还没有"}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="t-label-13 font-medium text-gray-900">互传同步包</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={doExport} disabled={!meta}>
              <Download className="size-3.5" /> 导出同步包
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void doShare()} disabled={!meta}>
              <Share2 className="size-3.5" /> 分享给附近设备
            </Button>
            <IconButton label="导入同步包" onClick={() => fileRef.current?.click()} disabled={!meta}>
              <FileUp className="size-4" />
            </IconButton>
            <input
              ref={fileRef}
              type="file"
              accept=".wulonsync,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="t-label-12 text-gray-700">
            同步包只包含这台设备的词库与进度；导入后先看合并预览，确认后才写入。
          </div>
        </div>
      </div>

      {/* 自动同步（Gist 档） */}
      <GistSyncBlock />

      {/* 合并预览 / 对账 */}
      <Dialog open={Boolean(pending)} onOpenChange={(v) => !v && setPending(null)}>
        <DialogHeader
          title="合并预览"
          desc={pending ? `来自 ${pending.payload.deviceId.slice(0, 8)} 的同步包（${pending.fileName}）` : ""}
        />
        <DialogBody className="space-y-4">
          {selfPack ? (
            <div className="rounded-lg bg-amber-700/10 p-2.5 text-[12px] text-amber-900">
              这是本机导出的同步包，导入通常没有变化。
            </div>
          ) : null}
          {mergeResult ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="green" size="sm">新增 {mergeResult.applied.booksAdded + mergeResult.applied.entriesAdded}</Badge>
                <Badge variant="blue" size="sm">更新 {mergeResult.applied.booksUpdated + mergeResult.applied.entriesUpdated}</Badge>
                <Badge variant="amber" size="sm">删除 {mergeResult.applied.booksDeleted + mergeResult.applied.entriesDeleted}</Badge>
                <Badge variant="gray" size="sm">冲突 {mergeResult.conflicts.length}</Badge>
              </div>

              {mergeResult.conflicts.length ? (
                <div className="space-y-2">
                  <div className="t-label-13 font-medium text-gray-900">需要留意的冲突（默认已按较新一侧选中）</div>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto scroll-thin">
                    {mergeResult.conflicts.map((c) => (
                      <div key={c.entityKey} className="flex items-center gap-2 rounded-lg bg-background-200 px-2.5 py-2 shadow-geist-border">
                        <div className="min-w-0 flex-1">
                          <div className="t-label-13 truncate text-gray-1000">{c.label}</div>
                          <div className="t-label-12 text-gray-700">{describeConflict(c.kind)}</div>
                        </div>
                        {(["local", "remote"] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            disabled={!c.canFlip}
                            onClick={() => setResolutions((prev) => ({ ...prev, [c.entityKey]: side }))}
                            className={cx(
                              "t-label-12 rounded-md px-2 py-1 transition-colors disabled:opacity-70",
                              c.chosen === side ? "bg-gray-1000 text-background-100" : "bg-background-100 text-gray-900 shadow-geist-border hover:bg-gray-100",
                            )}
                          >
                            {side === "local" ? "保留本机" : "保留远端"}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="t-label-13 text-gray-800">没有冲突，按较新记录自动合并。</div>
              )}

              <div className="t-label-12 text-gray-700">合并前会自动保存一份安全快照，可随时找回。</div>
            </>
          ) : (
            <div className="t-label-13 text-gray-800">正在准备合并…</div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPending(null)} disabled={applying}>
            取消
          </Button>
          <Button onClick={() => void applyMerge()} loading={applying} disabled={!mergeResult}>
            应用合并
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

function describeConflict(kind: MergeResult["conflicts"][number]["kind"]): string {
  switch (kind) {
    case "entry":
      return "词条内容两端都改过";
    case "schema":
      return "字段表两端都改过";
    case "exportSettings":
      return "导出样式两端都改过";
    case "studyConfig":
      return "学习设置两端都改过";
    case "bookMeta":
      return "词库名称 / 描述两端都改过";
    case "settings":
      return "应用设置两端都改过";
    default:
      return "两端都改过";
  }
}
