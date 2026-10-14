"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AcknowledgmentsDialog } from "@/components/app/Acknowledgments";
import { Card, CardTitle } from "@/components/ui/misc";
import pkg from "../../../../package.json";

export default function AboutSettingsPage() {
  const [ackOpen, setAckOpen] = useState(false);
  return (
    <SettingsShell title="关于">
      <Card className="space-y-3">
        <CardTitle desc={`版本 ${pkg.version} · 来自 Caddy Wulon · 乌龙罐`}>WulonVocab（乌龙单词）</CardTitle>
        <p className="t-label-13 text-gray-800">
          WulonVocab 是一个安静的词库工坊：字段由你组合，复习有它的节奏，攒下的词最后能排成一本可以打印的书。
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-300 pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- 静态导出 + 外链头像，刻意使用原生 img */}
          <img
            src="https://github.com/incoruptus.png"
            alt="Caddy Wulon 的头像"
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full bg-gray-100 shadow-geist-border"
          />
          <div className="min-w-0">
            <div className="t-label-13 text-gray-1000">@incoruptus</div>
            <div className="t-label-12 text-gray-700">因为相信，所以看见。</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => setAckOpen(true)}
              className="t-label-12 text-gray-800 underline-offset-2 hover:text-gray-1000 hover:underline"
            >
              鸣谢与技术栈
            </button>
            <a
              href="https://github.com/incoruptus"
              target="_blank"
              rel="noreferrer"
              className="t-label-12 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000"
            >
              <ExternalLink className="size-3.5" /> 作者的 GitHub
            </a>
            <a
              href="https://github.com/incoruptus/wulonvocab"
              target="_blank"
              rel="noreferrer"
              className="t-label-12 inline-flex items-center gap-1 text-gray-800 hover:text-gray-1000"
            >
              <ExternalLink className="size-3.5" /> 项目主页
            </a>
          </div>
        </div>
      </Card>
      <AcknowledgmentsDialog open={ackOpen} onOpenChange={setAckOpen} />
    </SettingsShell>
  );
}
