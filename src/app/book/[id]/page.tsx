import { Suspense } from "react";
import { BookWorkspace } from "@/components/book/BookWorkspace";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center text-gray-800">正在载入词库…</div>
      }
    >
      <BookWorkspace />
    </Suspense>
  );
}
