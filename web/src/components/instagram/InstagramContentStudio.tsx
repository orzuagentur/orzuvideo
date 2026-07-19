"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type IgJob = {
  id: string;
  status: string;
  title: string | null;
  caption: string | null;
  preview_url: string | null;
  instagram_permalink: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

const LABEL: Record<string, string> = {
  queued: "Queued",
  generating_script: "Script",
  generating_voice: "Voice",
  generating_avatar: "HeyGen avatar",
  editing: "Editing",
  uploading: "Uploading",
  ready: "Ready (draft)",
  published: "Published",
  failed: "Failed",
};

export function InstagramContentStudio({ jobs }: { jobs: IgJob[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...jobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [jobs],
  );

  async function createDraft() {
    const text = brief.trim();
    if (text.length < 8) {
      setMsg("Write at least a short idea for the Reel.");
      return;
    }
    setBusy("create");
    setMsg(null);
    const res = await fetch("/api/instagram/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: text, publish: false }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Failed to queue");
      return;
    }
    setBrief("");
    setShowCreate(false);
    setMsg("Draft queued — worker will generate via HeyGen (no publish yet).");
    router.refresh();
  }

  async function publishDraft(id: string) {
    if (!confirm("Publish this Reel to Instagram?")) return;
    setBusy(id);
    setMsg(null);
    const res = await fetch(`/api/instagram/jobs/${id}/publish`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Publish failed");
      return;
    }
    setMsg("Publish queued.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Create Reels with + — HeyGen avatar speaks your brief. Publish when ready.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary h-11 w-11 rounded-full text-2xl leading-none"
          style={{ background: "linear-gradient(135deg,#e1306c,#c13584)" }}
          onClick={() => setShowCreate(true)}
          aria-label="Create Reel"
        >
          +
        </button>
      </header>

      {msg && <p className="text-sm" style={{ color: "#e1306c" }}>{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.length === 0 && (
          <p className="panel col-span-full p-8 text-center text-sm text-[color:var(--muted)]">
            No Reels yet. Tap + to create a draft.
          </p>
        )}
        {sorted.map((job) => (
          <article
            key={job.id}
            className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]"
          >
            <div className="aspect-[9/16] max-h-[360px] bg-black/40">
              {job.preview_url ? (
                <video
                  src={job.preview_url}
                  className="h-full w-full object-cover"
                  controls
                  playsInline
                />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-[color:var(--muted)]">
                  {LABEL[job.status] || job.status}
                </div>
              )}
            </div>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 text-sm font-semibold">
                {job.title || "Untitled Reel"}
              </p>
              <p className="text-xs text-[color:var(--muted)]">
                {LABEL[job.status] || job.status}
                {job.error_message ? ` · ${job.error_message.slice(0, 80)}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {job.status === "ready" && (
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    disabled={busy === job.id}
                    onClick={() => void publishDraft(job.id)}
                  >
                    Publish
                  </button>
                )}
                {job.instagram_permalink && (
                  <a
                    href={job.instagram_permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost text-xs"
                  >
                    Open
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => busy !== "create" && setShowCreate(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="text-lg font-semibold">New Reel</h2>
            <p className="text-sm text-[color:var(--muted)]">
              Describe the Reel. Worker generates avatar video with HeyGen — draft only
              until you Publish.
            </p>
            <textarea
              className="field min-h-[140px]"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Example: 30s Reel about morning routine, energetic, look at camera, soft CTA to follow."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy === "create"}
                onClick={() => void createDraft()}
              >
                {busy === "create" ? "Queuing…" : "Create draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
