"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoJob } from "@/lib/types";
import {
  JOB_STATUS_LABEL,
  QUEUE_STATUSES,
  statusColor,
} from "@/lib/job-status";

type Filter = "all" | "queue" | "published" | "failed";

export function ContentStudio({ jobs }: { jobs: VideoJob[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<VideoJob | null>(jobs[0] || null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "queue") return jobs.filter((j) => QUEUE_STATUSES.has(j.status));
    if (filter === "published") return jobs.filter((j) => j.status === "published");
    if (filter === "failed") return jobs.filter((j) => j.status === "failed");
    return jobs;
  }, [jobs, filter]);

  async function removeSelected() {
    if (!selected?.youtube_video_id) return;
    if (!confirm("Delete from YouTube and mark content removed?")) return;
    setBusy(true);
    const res = await fetch("/api/youtube/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeVideoId: selected.youtube_video_id }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Delete failed");
      return;
    }
    setMsg("Deleted.");
    setSelected(null);
    router.refresh();
  }

  const embedId = selected?.youtube_video_id;

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Content</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Queue, published Shorts and full in-site preview.
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

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel rise overflow-hidden">
          <ul className="divide-y divide-[color:var(--line)] max-h-[70vh] overflow-auto">
            {filtered.length === 0 && (
              <li className="p-6 text-sm text-[color:var(--muted)]">No items.</li>
            )}
            {filtered.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  className="w-full p-4 text-left transition hover:bg-white/5"
                  style={{
                    background:
                      selected?.id === job.id ? "rgba(232,165,75,0.08)" : "transparent",
                  }}
                  onClick={() => setSelected(job)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        color: statusColor(job.status),
                        background: `${statusColor(job.status)}22`,
                      }}
                    >
                      {JOB_STATUS_LABEL[job.status] || job.status}
                    </span>
                    <span className="truncate font-medium">
                      {job.title || "Untitled Short"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel rise-delay space-y-4 p-5">
          {!selected ? (
            <p className="text-sm text-[color:var(--muted)]">Select content to preview.</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{selected.title || "Untitled"}</h2>
              {embedId ? (
                <div className="aspect-[9/16] max-h-[520px] overflow-hidden rounded-xl bg-black">
                  <iframe
                    title="preview"
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${embedId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-[color:var(--line)] p-6 text-sm text-[color:var(--muted)]">
                  Preview available after publish. Status:{" "}
                  {JOB_STATUS_LABEL[selected.status] || selected.status}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-[color:var(--muted)]">Views</p>
                  <p className="font-semibold">{selected.view_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-[color:var(--muted)]">Likes</p>
                  <p className="font-semibold">{selected.like_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-[color:var(--muted)]">Comments</p>
                  <p className="font-semibold">{selected.comment_count ?? 0}</p>
                </div>
              </div>

              {selected.script_text && (
                <div>
                  <p className="mb-1 text-xs uppercase text-[color:var(--muted)]">Script</p>
                  <p className="max-h-40 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                    {selected.script_text}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selected.youtube_url && (
                  <a
                    href={selected.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary text-sm"
                  >
                    Open on YouTube
                  </a>
                )}
                {selected.youtube_video_id && (
                  <button
                    className="btn btn-ghost text-sm"
                    style={{ color: "var(--danger)" }}
                    disabled={busy}
                    onClick={removeSelected}
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
