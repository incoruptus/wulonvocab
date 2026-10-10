"use client";

import { useRouter } from "next/navigation";
import { AiGeneratePanel } from "@/components/import/AiGeneratePanel";

/** 首页 AI 词表工坊入口：生成完成后直达新词库工作区 */
export function AiGenerateHero() {
  const router = useRouter();
  return <AiGeneratePanel variant="hero" onImported={(id) => router.push(`/book?id=${id}`)} />;
}
