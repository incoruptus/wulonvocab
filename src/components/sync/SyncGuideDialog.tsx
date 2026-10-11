"use client";

import { useState } from "react";
import { Cloud, ExternalLink, FileUp, KeyRound, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/misc";
import { cx } from "@/lib/utils";

/**
 * 同步向导：把「是什么 / 为什么 / 怎么做」讲完的一页式导引。
 * 第 1 步讲清两种搬运方式，第 2–3 步手把手完成 Gist 自动同步的全部配置。
 */
export function SyncGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [step, setStep] = useState(0);

  const close = (v: boolean) => {
    if (!v) setStep(0);
    onOpenChange(v);
  };

  const steps = [
    {
      key: "why",
      title: "为什么需要「搬运」",
      body: (
        <div className="space-y-3">
          <p className="t-label-13 text-gray-800">
            词库、学习进度与删除记录默认都保存在这台设备上，所以手机和电脑一开始各记各的。
            跨端同步就是把两边<strong>拼在一起</strong>：学过的记录、删掉的词、改过的设置都会对上，不会「删了又回来」。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-background-200 p-3">
              <div className="flex items-center gap-2">
                <FileUp className="size-4 text-gray-800" />
                <span className="t-label-13 font-medium text-gray-1000">方式一 · 同步包</span>
                <Badge variant="gray" size="sm">零配置</Badge>
              </div>
              <p className="mt-1.5 t-label-12 text-gray-700">
                导出一个小文件（AirDrop / 微信 / 网盘都能带），在任何一台导入合并。
                偶尔换机、偶尔对账，用它就够了。
              </p>
            </div>
            <div className="rounded-lg bg-background-200 p-3">
              <div className="flex items-center gap-2">
                <Cloud className="size-4 text-gray-800" />
                <span className="t-label-13 font-medium text-gray-1000">方式二 · 自动同步</span>
                <Badge variant="blue" size="sm">推荐</Badge>
              </div>
              <p className="mt-1.5 t-label-12 text-gray-700">
                借你的 GitHub 免费「Gist」当私密中转站，设置一次，之后打开应用自动对账。
                内容先加密再上传，中转站看到的只是一串密文。
              </p>
            </div>
          </div>
        </div>
      ),
      footer: "下一步：3 分钟配好自动同步",
    },
    {
      key: "token",
      title: "第 1 步 · GitHub Token：一张只开 Gist 的门禁卡",
      body: (
        <div className="space-y-3">
          <p className="t-label-13 text-gray-800">
            Gist 存在<strong>你的 GitHub 账号</strong>里，所以应用要带上一张门禁卡（Token），才有资格把内容放进你自己的柜子。
            这张卡只能开 Gist 这一个柜子，碰不了你的代码和仓库。
          </p>
          <p className="t-label-12 text-gray-700">
            <strong>Token 只保存在这台设备</strong>，不发给任何人、不上传。它管的是「放得进你的柜子」。
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 t-label-13 text-gray-800">
            <li>打开下面这个链接（已帮你勾好权限，只需要点一下确认）。</li>
            <li>点「Generate token」，把生成的长串整段复制。</li>
            <li>回到「跨端同步」，粘贴进「GitHub Token」并保存。</li>
          </ol>
          <a
            href="https://github.com/settings/tokens/new?scopes=gist&description=WulonVocab%20%E5%90%8C%E6%AD%A5"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-1000 px-3.5 text-[14px] font-medium text-background-100 transition-opacity hover:opacity-90"
          >
            <ExternalLink className="size-3.5" /> 打开 GitHub 创建 Token（gist 权限）
          </a>
          <p className="t-label-12 text-gray-700">看不到按钮被墙？github.com 通常可直连；勾选的是「gist」这一个权限，其余请保持默认。</p>
        </div>
      ),
      footer: "下一步：认识配对码",
    },
    {
      key: "pair",
      title: "第 2 步 · 配对码：保险箱密码",
      body: (
        <div className="space-y-3">
          <p className="t-label-13 text-gray-800">
            为什么两个都要？因为它们是<strong>两把不同的钥匙，分工正好互补</strong>：
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-background-200 p-3">
              <div className="flex items-center gap-1.5 t-label-12 font-medium text-gray-900">
                <Cloud className="size-3.5" /> GitHub Token · 门禁卡
              </div>
              <p className="mt-1 t-label-12 text-gray-700">决定「能不能进你的柜子」：没有它，写不进也读不出你的 Gist。</p>
            </div>
            <div className="rounded-lg bg-background-200 p-3">
              <div className="flex items-center gap-1.5 t-label-12 font-medium text-gray-900">
                <KeyRound className="size-3.5" /> 配对码 · 保险箱密码
              </div>
              <p className="mt-1 t-label-12 text-gray-700">决定「看得懂看不懂」：内容全程加密，链接泄露也只是一串乱码。</p>
            </div>
          </div>
          <p className="t-label-13 text-gray-800">
            配对码在本地生成；每台设备输入同一串码，就能互相解开内容：
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 t-label-13 text-gray-800">
            <li>这台设备点「生成配对码」。</li>
            <li>通过微信 / 备忘录 / 面对面，把码发给要同步的设备（有几台发几台）。</li>
            <li>每台都在同样位置粘贴，保存即可。</li>
          </ol>
          <div className="rounded-lg bg-amber-700/10 p-2.5 t-label-12 text-amber-900">
            配对码就是密码，别发到公开群里。丢了也没关系，重新生成一串、各设备重新配对一次，数据同步就会对上。
          </div>
        </div>
      ),
      footer: "下一步：完成！",
    },
    {
      key: "done",
      title: "完成 · 之后它会自己动",
      body: (
        <div className="space-y-3">
          <p className="t-label-13 text-gray-800">配好之后（两台、三台……都可以），同步会在这些时机自动发生：</p>
          <ul className="space-y-1.5 t-label-13 text-gray-800">
            <li className="flex items-center gap-2"><Sparkles className="size-3.5 text-gray-800" /> 打开应用约 5 秒后</li>
            <li className="flex items-center gap-2"><RefreshCw className="size-3.5 text-gray-800" /> 切回前台时（距上次超过 10 分钟）、恢复联网时</li>
            <li className="flex items-center gap-2"><KeyRound className="size-3.5 text-gray-800" /> 常驻时每 30 分钟一次；也可以随时点「立即同步」</li>
          </ul>
          <div className="rounded-lg bg-background-200 p-3">
            <div className="t-label-13 font-medium text-gray-1000">合并是怎么算的（覆盖原理）</div>
            <ul className="mt-1.5 space-y-1 t-label-12 text-gray-700">
              <li>· 一边改、一边没动 → 取改过的那一边；<strong>两边都改同一处 → 较新的改动胜</strong>，并提示冲突处数，可在预览里翻转</li>
              <li>· 删除会留「墓碑」随数据传播，不会被其他设备把删掉的词「复活」</li>
              <li>· 学习进度：复习记录取最近一次；每日统计取两边较大值（不会重复累计）</li>
              <li>· <strong>明暗模式与强调色不会同步</strong>，每台设备保留自己的外观；其余设置（数据源、学习参数等）跨端对齐</li>
              <li>· 每次合并前都先留一份<strong>安全快照</strong>；自动同步也是「先拉 → 合并 → 再推回」，不会整包覆盖</li>
            </ul>
          </div>
          <div className="rounded-lg bg-blue-100 p-3">
            <div className="t-label-13 font-medium text-blue-900">三台、五台也可以</div>
            <p className="mt-1 t-label-12 text-blue-900">
              同一对 Token 和配对码，在每一台照配一遍、都打开自动同步就行。每台都会「先拉最新 → 合并 → 再推回去」，
              像接力棒：一台的改动经另一台传到第三台，最多多等一轮。删除也会跟着传播，不会被别的设备「复活」。
            </p>
          </div>
          <p className="t-label-12 text-gray-700">
            合并前会自动留一份安全快照；真正的冲突（两端都改了同一处）按较新一侧，并在提示里计数。
          </p>
        </div>
      ),
      footer: null,
    },
  ];

  const current = steps[step];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogHeader
        title="跨端同步向导"
        desc="两分钟读完，知道它是怎么在保护你的数据的前提下工作的"
      />
      <DialogBody className="space-y-4">
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-gray-1000" : "bg-gray-300")}
            />
          ))}
        </div>
        <div className="space-y-1">
          <div className="t-h-14 text-gray-1000">{current.title}</div>
          {current.body}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => close(false)}>
          {step === steps.length - 1 ? "完成" : "稍后再说"}
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))}>{current.footer}</Button>
        ) : (
          <Button onClick={() => close(false)}>开始使用</Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
