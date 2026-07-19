"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile, VideoJob } from "@/lib/types";

export function ChannelStudio({
  profile,
  videos,
}: {
  profile: Profile | null;
  videos: VideoJob[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy("sync");
    setMsg(null);
    const res = await fetch("/api/youtube/stats", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Sync failed");
      return;
    }
    setMsg("Channel stats refreshed.");
    router.refresh();
  }

  async function removeVideo(youtubeVideoId: string) {
    if (!confirm("Delete this video from YouTube?")) return;
    setBusy(youtubeVideoId);
    setMsg(null);
    const res = await fetch("/api/youtube/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeVideoId }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Delete failed");
      return;
    }
    setMsg("Video deleted.");
    router.refresh();
  }

  if (!profile?.youtube_connected) {
    return (
      <div className="panel rise space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Channel</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Connect a YouTube channel to see subscribers, views and published Shorts.
        </p>
        <a href="/api/youtube/connect" className="btn btn-primary">
          Connect YouTube
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Channel</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Live channel health and published content.
          </p>
        </div>
        <button className="btn btn-ghost text-sm" disabled={busy === "sync"} onClick={sync}>
          {busy === "sync" ? "Syncing…" : "Refresh stats"}
        </button>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <section className="panel rise flex flex-wrap items-center gap-5 p-6">
        {profile.youtube_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.youtube_thumbnail_url}
            alt=""
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/30 text-sm">
            YT
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">
            {profile.youtube_channel_title || "YouTube channel"}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {profile.youtube_custom_url || profile.youtube_channel_id}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="Subscribers" value={profile.youtube_subscriber_count ?? 0} />
          <Stat label="Views" value={profile.youtube_view_count ?? 0} />
          <Stat label="Videos" value={profile.youtube_video_count ?? 0} />
        </div>
      </section>

      <section className="panel rise-delay overflow-hidden">
        <div className="border-b border-[color:var(--line)] p-5">
          <h3 className="font-semibold">Published on this channel</h3>
        </div>
        <ul className="divide-y divide-[color:var(--line)]">
          {videos.length === 0 && (
            <li className="p-6 text-sm text-[color:var(--muted)]">No published Shorts yet.</li>
          )}
          {videos.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.title || "Untitled"}</p>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  Views {v.view_count ?? 0} · Likes {v.like_count ?? 0} · Comments{" "}
                  {v.comment_count ?? 0}
                  {v.completed_at
                    ? ` · ${new Date(v.completed_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {v.youtube_url && (
                  <a
                    href={v.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost text-xs"
                  >
                    Open
                  </a>
                )}
                {v.youtube_video_id && (
                  <button
                    className="btn btn-ghost text-xs"
                    style={{ color: "var(--danger)" }}
                    disabled={busy === v.youtube_video_id}
                    onClick={() => removeVideo(v.youtube_video_id!)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
