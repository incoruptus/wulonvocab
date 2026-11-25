"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";

/** 学习首页与词库复习参数页共用同一份机制说明。 */
export function StudyEngineHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="学习引擎怎么安排？" variant="ghost" className="-mr-1.5 -mt-1.5">
          <CircleHelp className="size-4" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
        <div className="t-label-13 font-medium text-gray-1000">学习引擎怎么安排？</div>
        <div className="t-label-12 mt-2 space-y-2 text-gray-800">
          <p>新词先看内容，再按熟悉感选择验证路径；熟悉感本身不评分，再认正确最多记「模糊」。</p>
          <p>复习由 FSRS 按到期时间与记忆稳固度安排；「忘记」会在本轮继续出现，直到你给出更肯定的答案或选择「先放下」。</p>
          <p>每日计划先按时间预算安排复习，再减少新词；弱词优先最多占本轮复习的 20%，只改变顺序，不直接改变正确答案的等级。</p>
          <p>选择题有看词选英文释义、看英文释义选英文词、看中文释义选英文词、看词选中文释义四种，每题四选一并限时；超时记「忘记」，切到其他页面或打开弹层时暂停。</p>
          <p>Cloze 是独立的例句提取模式；「混搭」则按比例安排熟悉度自评、选择题与 Cloze，并可继续调整四个选择题子型的内部占比。</p>
          <p>R(30) 表示按当前记忆强度估计 30 天后仍记得的概率。它是当前估计，不是永久掌握，也不代表以后不用复习。</p>
          <p>反复忘记达到词库设置的阈值后会标记为顽固词，你可以搁置、改卡或降级重学；系统不会自动停考。</p>
          <p>再认、回忆、产出按复习日志分别记录，只取每个会话每层的首次评分；它们帮助你看清自己会认、会想还是会用，派生结论不另存一套同步状态。</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
