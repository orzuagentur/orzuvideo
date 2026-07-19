"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoJob } from "@/lib/types";
import { QUEUE_STATUSES } from "@/lib/job-status";
import { YouTubeVideoCards } from "@/components/YouTubeVideoCards";

type Filter = "all" | "queue" | "published" | "failed";

export function ContentStudio({ jobs }: { jobs: VideoJob[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "queue") return jobs.filter((j) => QUEUE_STATUSES.has(j.status));
    if (filter === "published") return jobs.filter((j) => j.status === "published");
    if (filter === "failed") return jobs.filter((j) => j.status === "failed");
    return jobs;
  }, [jobs, filter]);

  async function removeVideo(youtubeVideoId: string) {
    if (!confirm("Delete from YouTube and mark content removed?")) return;
    setBusy(youtubeVideoId);
    setMsg(null);
    const res = await fetch("/api/youtube/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeVideoId }),
    });
    setBusy(null);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Delete failed");
      return;
    }
    setMsg("Deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Content</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Your Shorts as cards — preview, comments, and stats like YouTube.
        </p>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["queue", "Queue"],
            ["published", "Published"],
            ["failed", "Failed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="rounded-full px-3 py-1.5 text-sm"
            style={{
              background:
                filter === id ? "rgba(232,165,75,0.16)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${filter === id ? "rgba(232,165,75,0.45)" : "var(--line)"}`,
              color: filter === id ? "var(--accent)" : "var(--muted)",
            }}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <YouTubeVideoCards
        jobs={filtered}
        onDelete={removeVideo}
        busyId={busy}
        emptyLabel="No content in this filter."
      />
    </div>
  );
}
