"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, VideoJob } from "@/lib/types";
import { YouTubeVideoCards } from "@/components/YouTubeVideoCards";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";

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
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.youtube_connected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/youtube/banner");
        const data = await res.json();
        if (!cancelled && res.ok && data.bannerUrl) {
          setBannerUrl(data.bannerUrl as string);
        }
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.youtube_connected, profile?.youtube_channel_id]);

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
    if (data.bannerUrl) setBannerUrl(data.bannerUrl as string);
    setMsg("Stats refreshed.");
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect this YouTube channel?")) return;
    setBusy("disconnect");
    setMsg(null);
    const res = await fetch("/api/youtube/disconnect", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Disconnect failed");
      return;
    }
    setMsg("Channel disconnected.");
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
          Connect a YouTube channel to publish Shorts and see stats.
        </p>
        <a href="/api/youtube/connect" className="btn btn-primary inline-flex">
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
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/dashboard/channel/training" className="btn btn-primary text-sm">
            AI Training
          </a>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={busy === "sync"}
            onClick={() => void sync()}
          >
            {busy === "sync" ? "Syncing..." : "Refresh"}
          </button>
        </div>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <section className="panel rise relative">
        <CardMenuSlot>
          <CardMenu
            items={[
              { label: "+ YouTube channel", href: "/api/youtube/connect" },
              {
                label: busy === "disconnect" ? "Disconnecting..." : "Disconnect",
                danger: true,
                disabled: busy === "disconnect",
                onClick: () => void disconnect(),
              },
            ]}
          />
        </CardMenuSlot>

        <div className="relative h-28 w-full overflow-hidden rounded-t-[inherit] bg-gradient-to-br from-[#1a1a1a] via-[#2a1810] to-[#0d0d0d] sm:h-36">
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--bg-elevated)] via-transparent to-black/20" />
        </div>

        <div className="relative -mt-10 space-y-4 px-5 pb-5 sm:px-6">
          <div className="flex flex-wrap items-end gap-4">
            {profile.youtube_thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.youtube_thumbnail_url}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-[color:var(--bg-elevated)] object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[color:var(--bg-elevated)] bg-black/40 text-sm">
                YT
              </div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="truncate text-xl font-semibold">
                {profile.youtube_channel_title || "YouTube channel"}
              </h2>
              <p className="truncate text-sm text-[color:var(--muted)]">
                {profile.youtube_custom_url || profile.youtube_channel_id}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center sm:max-w-md">
            <Stat label="Subscribers" value={profile.youtube_subscriber_count ?? 0} />
            <Stat label="Views" value={profile.youtube_view_count ?? 0} />
            <Stat label="Videos" value={profile.youtube_video_count ?? 0} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Published Shorts</h3>
        <YouTubeVideoCards
          jobs={videos}
          onDelete={removeVideo}
          busyId={busy}
          emptyLabel="No published Shorts yet."
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-black/20 px-2 py-3">
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{formatCount(value)}</p>
    </div>
  );
}

/** Locale-independent so SSR and client match. */
function formatCount(value: number) {
  const n = Math.round(Number(value) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
