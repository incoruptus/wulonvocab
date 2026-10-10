"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { ExportStudio } from "@/components/export/ExportStudio";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export function ExportPageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const hydrated = useAppStore((s) => s.hydrated);
  const book = useAppStore((s) => s.books.find((b) => b.id === id));

  if (!hydrated) {
    return <div className="flex h-dvh items-center justify-center text-gray-800">正在载入…</div>;
  }
  if (!book) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <EmptyState
          title="未找到该词库"
          desc="无法打开导出工作室。"
          action={
            <Link href="/">
              <Button variant="secondary">返回词库列表</Button>
            </Link>
          }
        />
      </div>
    );
  }
  return <ExportStudio book={book} />;
}
