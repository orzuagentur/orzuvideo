import { Suspense } from "react";
import { LibraryStudio } from "@/components/LibraryStudio";

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      }
    >
      <LibraryStudio />
    </Suspense>
  );
}
