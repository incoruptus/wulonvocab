import { Suspense } from "react";
import { ExportPageClient } from "@/components/export/ExportPageClient";

export default function Page() {
  return (
    <Suspense
      fallback={<div className="flex h-dvh items-center justify-center text-gray-800">正在打开导出工作室…</div>}
    >
      <ExportPageClient />
    </Suspense>
  );
}
