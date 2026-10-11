"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Copy, Loader2, QrCode, ScanLine, Wifi } from "lucide-react";
import { toast } from "sonner";
import { generatePairCode, isPairCodeWellFormed, normalizePairCode } from "@/lib/sync/crypto";
import { hlcNow, hlcToString } from "@/lib/sync/clock";
import { buildEncryptedEnvelope, buildSyncPayload, parseEnvelopeWithCode, serializeEnvelope } from "@/lib/sync/pack";
import { loadSyncMeta } from "@/lib/sync/meta";
import { createPeerTransfer, type PeerTransfer } from "@/lib/sync/transports/peer";
import type { SyncPayloadV1 } from "@/lib/sync/types";
import { useAppStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/overlay";

/**
 * 扫码直传（PeerJS · 免 GitHub）：
 * 两台设备面对面——一台出码（会话码同时是信令房间与加密钥匙），一台扫码/手输；
 * 直连后互换加密信封，走与同步包相同的合并预览。数据不经过任何服务器。
 */
export function PeerSyncDialog({
  open,
  onOpenChange,
  onPayload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPayload: (payload: SyncPayloadV1) => void;
}) {
  const [mode, setMode] = useState<"host" | "guest" | null>(null);
  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const transferRef = useRef<PeerTransfer | null>(null);
  const sentRef = useRef(false);
  const camRef = useRef<{ stream: MediaStream; raf: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const stopCamera = useCallback(() => {
    if (!camRef.current) return;
    camRef.current.stream.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(camRef.current.raf);
    camRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    transferRef.current?.close();
    transferRef.current = null;
    sentRef.current = false;
    stopCamera();
  }, [stopCamera]);

  const handleOpen = useCallback(
    (v: boolean) => {
      if (!v) {
        teardown();
        setScanning(false);
        setMode(null);
        setCode("");
        setStatus("");
        setError(null);
        setBusy(false);
      }
      onOpenChange(v);
    },
    [onOpenChange, teardown],
  );

  useEffect(() => () => teardown(), [teardown]);

  // 二维码绘制（mode 进入 host 且 canvas 已挂载后）
  useEffect(() => {
    if (mode !== "host" || !code) return;
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    void import("qrcode")
      .then((m) => m.toCanvas(canvas, JSON.stringify({ v: 1, k: code }), { width: 240, margin: 1 }))
      .catch(() => setError("二维码生成失败——可直接复制下方的会话码"));
  }, [mode, code]);

  /** 本端信封：与 Gist 档同格式，用「会话码」作加密钥匙（临时配对，独立于长期配对码） */
  const buildOwnEnvelope = useCallback(async (sessionCode: string) => {
    const meta = await loadSyncMeta();
    const s = useAppStore.getState();
    const payload = buildSyncPayload(
      { books: s.books, settings: s.settings, lookupSources: s.lookupSources, dictionaries: s.dictionaries },
      { mode: "snapshot", deviceId: meta.device.id, tombstones: meta.tombstones },
    );
    const envelope = await buildEncryptedEnvelope(payload, {
      deviceId: meta.device.id,
      hlcString: hlcToString(hlcNow(null, meta.device.id)),
      pairCode: sessionCode,
    });
    return serializeEnvelope(envelope);
  }, []);

  const handleEnvelope = useCallback(
    async (text: string, sessionCode: string) => {
      try {
        const { payload } = await parseEnvelopeWithCode(text, sessionCode);
        setStatus("收到对方数据——请在合并预览里确认");
        onOpenChange(false);
        onPayload(payload);
      } catch (e) {
        setError(`对方数据解不开：${(e as Error).message}`);
      }
    },
    [onOpenChange, onPayload],
  );

  const onConnected = useCallback(
    (sessionCode: string) => {
      if (sentRef.current) return;
      sentRef.current = true;
      setStatus("已直连——正在互传数据…");
      void buildOwnEnvelope(sessionCode)
        .then((text) => transferRef.current?.sendEnvelope(text))
        .catch((e) => setError((e as Error).message));
    },
    [buildOwnEnvelope],
  );

  const startHost = async () => {
    setError(null);
    setMode("host");
    setBusy(true);
    teardown();
    const sessionCode = generatePairCode();
    setCode(sessionCode);
    setStatus("正在准备二维码…");
    try {
      const transfer = await createPeerTransfer(sessionCode, "host", {
        onStatus: (s, detail) => {
          if (s === "waiting") setStatus("等待对方扫码…（两台设备都开着这一页）");
          if (s === "connecting") setStatus("正在建立直连…");
          if (s === "connected") onConnected(sessionCode);
          if (detail) setError(detail);
        },
        onEnvelope: (text) => void handleEnvelope(text, sessionCode),
      });
      transferRef.current = transfer;
      setStatus("等待对方扫码…（两台设备都开着这一页）");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const joinWithCode = async (raw: string) => {
    const sessionCode = normalizePairCode(raw);
    if (!isPairCodeWellFormed(sessionCode)) {
      setError("会话码格式不对——应为 20 位（形如 XXXX-XXXX-XXXX-XXXX-XXXX）");
      return;
    }
    setError(null);
    setMode("guest");
    setBusy(true);
    teardown();
    stopCamera();
    setScanning(false);
    setCode(sessionCode);
    setStatus("正在连接对方…");
    try {
      const transfer = await createPeerTransfer(sessionCode, "guest", {
        onStatus: (s, detail) => {
          if (s === "connecting") setStatus("正在敲对方的门…");
          if (s === "connected") onConnected(sessionCode);
          if (detail) setError(detail);
        },
        onEnvelope: (text) => void handleEnvelope(text, sessionCode),
      });
      transferRef.current = transfer;
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    setError(null);
    setMode("guest");
    setStatus("把对方屏幕上的二维码放进取景框…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      camRef.current = { stream, raf: 0 };
      setScanning(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      const tick = async () => {
        if (!camRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { default: jsQR } = await import("jsqr");
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (found?.data) {
              try {
                const parsed = JSON.parse(found.data) as { v?: number; k?: string };
                if (parsed.v === 1 && typeof parsed.k === "string") {
                  void joinWithCode(parsed.k);
                  return;
                }
              } catch {
                /* 不是我们的码，继续扫 */
              }
            }
          }
        }
        if (camRef.current) camRef.current.raf = requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch (e) {
      setError(`相机不可用：${(e as Error).message}——可以改用手动输入会话码`);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("会话码已复制");
    } catch {
      toast.info("复制失败，请手动选中复制");
    }
  };

  const busyLine = busy ? (
    <div className="flex items-center gap-2 t-label-13 text-gray-800">
      <Loader2 className="size-3.5 animate-spin" /> {status || "处理中…"}
    </div>
  ) : status ? (
    <div className="t-label-13 text-gray-800">{status}</div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogHeader
        title="扫码直传"
        desc="两台设备面对面：一台出码、一台扫码，WebRTC 直连互换并合并——不经过 GitHub，也不经过任何服务器。"
      />
      <DialogBody className="space-y-4">
        {mode === null ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void startHost()}
              className="rounded-xl bg-background-200 p-4 text-left transition-shadow hover:shadow-geist-border"
            >
              <QrCode className="size-5 text-gray-800" />
              <div className="mt-2 t-label-13 font-medium text-gray-1000">本机出码（在这台扫码接收）</div>
              <p className="mt-1 t-label-12 text-gray-700">会生成一张一次性二维码与会话码，等对方来扫。</p>
            </button>
            <button
              type="button"
              onClick={() => void startScan()}
              className="rounded-xl bg-background-200 p-4 text-left transition-shadow hover:shadow-geist-border"
            >
              <ScanLine className="size-5 text-gray-800" />
              <div className="mt-2 t-label-13 font-medium text-gray-1000">扫码加入（去扫对方的码）</div>
              <p className="mt-1 t-label-12 text-gray-700">用相机扫对方屏幕；相机不可用可手动输入会话码。</p>
            </button>
          </div>
        ) : null}

        {mode === "host" ? (
          <div className="flex flex-col items-center gap-3">
            <canvas ref={qrCanvasRef} className="size-[240px] rounded-lg bg-white p-2 shadow-geist-border" aria-label="会话二维码" />
            <div className="flex items-center gap-2">
              <span className="t-mono-12 text-gray-1000">{code}</span>
              <IconButton label="复制会话码" onClick={() => void copyCode()}>
                <Copy className="size-3.5" />
              </IconButton>
            </div>
            <div className="flex items-center gap-1.5 t-label-12 text-gray-700">
              <Wifi className="size-3.5" /> 会话码同时是加密钥匙：内容在两端之间直接加密传输
            </div>
          </div>
        ) : null}

        {mode === "guest" ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg bg-gray-1000/90" style={{ aspectRatio: "4 / 3" }}>
              <video ref={videoRef} playsInline muted className="size-full object-cover" />
              {!scanning ? <Camera className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-background-100/70" /> : null}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="或手动输入会话码 XXXX-XXXX-…"
                className="font-mono text-[13px]"
              />
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void joinWithCode(codeInput)}>
                加入
              </Button>
            </div>
          </div>
        ) : null}

        {busyLine}
        {error ? <div className="rounded-lg bg-amber-700/10 p-2.5 t-label-12 text-amber-900">{error}</div> : null}
        {mode !== null ? (
          <div className="flex justify-between">
            <Button variant="tertiary" size="sm" onClick={() => { teardown(); setScanning(false); setMode(null); setCode(""); setStatus(""); setError(null); }}>
              换一种方式
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleOpen(false)}>
              关闭
            </Button>
          </div>
        ) : null}
      </DialogBody>
    </Dialog>
  );
}
