import { Suspense } from "react";
import { StudyClient } from "@/components/study/StudyClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-gray-800">正在打开学习面板…</div>}>
      <StudyClient />
    </Suspense>
  );
}
