"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoJob } from "@/lib/types";
import { QUEUE_STATUSES } from "@/lib/job-status";
import { YouTubeVideoCards } from "@/components/YouTubeVideoCards";

type Filter = "all" | "queue" | "ready" | "published" | "failed";

export function ContentStudio({ jobs }: { jobs: VideoJob[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "queue") return jobs.filter((j) => QUEUE_STATUSES.has(j.status));
    if (filter === "ready") return jobs.filter((j) => j.status === "ready");
    if (filter === "published") return jobs.filter((j) => j.status === "published");
    if (filter === "failed") return jobs.filter((j) => j.status === "failed");
    return jobs;
  }, [jobs, filter]);

  async function createDraft() {
    const text = brief.trim();
    if (text.length < 8) {
      setMsg("Write a short idea for the video (at least a sentence).");
      return;
    }
    setCreating(true);
    setMsg(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: text, publish: false }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg(data.error || "Could not queue video");
      return;
    }
    setBrief("");
    setShowCreate(false);
    setMsg("Draft queued — worker will create it without publishing.");
    router.refresh();
  }

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

  async function publishDraft(jobId: string) {
    if (!confirm("Publish this draft to YouTube?")) return;
    setBusy(jobId);
    setMsg(null);
    const res = await fetch(`/api/jobs/${jobId}/publish`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Publish failed");
      return;
    }
    setMsg("Publishing queued.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Create drafts with +, preview, then publish when ready.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary h-11 w-11 shrink-0 rounded-full text-2xl leading-none"
          aria-label="Create new Short"
          title="Create Short (draft)"
          onClick={() => setShowCreate(true)}
        >
          +
        </button>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["queue", "Queue"],
            ["ready", "Drafts"],
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
        onPublish={publishDraft}
        busyId={busy}
        emptyLabel="No content in this filter."
      />

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6"
          onClick={() => !creating && setShowCreate(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">New Short</h2>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  Describe the video — AI creates a draft. It will not upload to YouTube
                  until you publish.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Close
              </button>
            </div>

            <textarea
              className="field min-h-[140px]"
              placeholder="Example: A Short about waking up at 5am and why discipline beats motivation. Aggressive hook, gym / city morning B-roll."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={creating}
              autoFocus
            />

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost text-sm"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={creating}
                onClick={() => void createDraft()}
              >
                {creating ? "Queuing…" : "Create draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
