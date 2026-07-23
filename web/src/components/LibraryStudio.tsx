"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";
import { useToast } from "@/components/ToastNotice";
import { createClient } from "@/lib/supabase/client";
import type { VideoJob } from "@/lib/types";

type LibTab = "clips" | "videos" | "favorites";

type FavoriteItem = {
  id: string;
  kind: "video" | "photo" | "music" | "creator";
  asset_id: string;
  title: string | null;
  author: string | null;
  thumb: string | null;
  preview_url: string | null;
  download_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

const JOB_SELECT =
  "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds,storage_path,storage_bucket,metadata";

function formatDuration(sec: number | null | undefined) {
  if (sec == null || Number.isNaN(sec)) return null;
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function isClippingJob(job: VideoJob) {
  const src = String(job.metadata?.source || "");
  const pipeline = String(job.metadata?.pipeline || "");
  return (
    src === "clipping" ||
    pipeline === "clipping" ||
    src === "ai_clipping" ||
    pipeline === "ai_clipping" ||
    (src === "reedit" && String(job.metadata?.library || "") === "clipping")
  );
}

function isCreativityJob(job: VideoJob) {
  const src = String(job.metadata?.source || "");
  const pipeline = String(job.metadata?.pipeline || "");
  return src === "creativity" || pipeline === "creativity";
}

function FavHeart({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="absolute left-2 top-2 z-[2] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 transition hover:bg-black/75"
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      style={{ color: active ? "#ff4d6d" : "#fff" }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}

function parseTab(raw: string | null): LibTab {
  if (raw === "videos" || raw === "favorites" || raw === "clips") return raw;
  return "clips";
}

export function LibraryStudio() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { show: toast, notice } = useToast();
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [favs, setFavs] = useState<FavoriteItem[]>([]);
  const [favKeys, setFavKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio] = useState(() =>
    typeof Audio !== "undefined" ? new Audio() : null,
  );

  const loadJobs = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setJobs([]);
      return;
    }
    const { data, error } = await supabase
      .from("video_jobs")
      .select(JOB_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) {
      toast(error.message || "Failed to load library", "error");
      setJobs([]);
      return;
    }
    setJobs((data || []) as VideoJob[]);
  }, [toast]);

  const loadFavs = useCallback(async () => {
    const res = await fetch("/api/favorites");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Failed to load favorites", "error");
      setFavs([]);
      setFavKeys(new Set());
      return;
    }
    const items = (data.items || []) as FavoriteItem[];
    setFavs(items);
    setFavKeys(new Set(items.map((x) => `${x.kind}:${x.asset_id}`)));
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadJobs(), loadFavs()]).finally(() => setLoading(false));
  }, [loadJobs, loadFavs]);

  useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  const clips = useMemo(
    () => jobs.filter((j) => isClippingJob(j)),
    [jobs],
  );
  const videos = useMemo(
    () => jobs.filter((j) => isCreativityJob(j)),
    [jobs],
  );

  async function toggleJobFavorite(job: VideoJob) {
    const kind = "video";
    const asset_id = job.id;
    const key = `${kind}:${asset_id}`;
    const active = favKeys.has(key);
    if (active) {
      const res = await fetch(
        `/api/favorites?kind=${encodeURIComponent(kind)}&asset_id=${encodeURIComponent(asset_id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to remove", "error");
        return;
      }
      setFavKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setFavs((prev) =>
        prev.filter((x) => !(x.kind === kind && x.asset_id === asset_id)),
      );
      return;
    }
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        asset_id,
        title: job.title || "Untitled",
        thumb: job.thumbnail_url,
        preview_url: job.preview_url
          ? `/api/jobs/${job.id}/preview`
          : null,
        duration_sec: job.duration_seconds,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Failed to favorite", "error");
      return;
    }
    setFavKeys((prev) => new Set(prev).add(key));
    void loadFavs();
  }

  async function removeFav(item: FavoriteItem) {
    const res = await fetch(
      `/api/favorites?kind=${encodeURIComponent(item.kind)}&asset_id=${encodeURIComponent(item.asset_id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Failed to remove", "error");
      return;
    }
    setFavs((prev) =>
      prev.filter(
        (x) => !(x.kind === item.kind && x.asset_id === item.asset_id),
      ),
    );
    setFavKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${item.kind}:${item.asset_id}`);
      return next;
    });
  }

  function togglePlay(item: FavoriteItem) {
    if (!audio || !item.preview_url) return;
    if (playingId === item.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.pause();
    audio.src = item.preview_url;
    void audio.play().then(() => setPlayingId(item.id));
    audio.onended = () => setPlayingId(null);
  }

  const jobList = tab === "clips" ? clips : tab === "videos" ? videos : [];
  const heading =
    tab === "clips"
      ? "My clips"
      : tab === "videos"
        ? "My videos"
        : "Favorites";

  return (
    <div className="flex w-full flex-col gap-4 pb-16">
      {notice}
      <h1
        className="font-[family-name:var(--font-syne)] text-2xl tracking-tight sm:text-3xl"
        style={{ fontWeight: 800 }}
      >
        {heading}
      </h1>

      {loading ? (
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      ) : tab === "favorites" ? (
        favs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--line)] p-10 text-center text-sm text-[color:var(--muted)]">
            No favorites yet. Tap the heart on creators assets or your clips.
          </p>
        ) : (
          <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {favs.map((item) => {
              const dur = formatDuration(item.duration_sec);
              const playing = playingId === item.id;
              return (
                <li
                  key={`${item.kind}:${item.asset_id}`}
                  className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/25"
                >
                  <div className="relative aspect-square w-full bg-black/40">
                    {item.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumb}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl text-[color:var(--muted)]">
                        {item.kind === "music" ? "♪" : "◆"}
                      </div>
                    )}
                    <FavHeart
                      active
                      onToggle={() => void removeFav(item)}
                    />
                    <CardMenuSlot>
                      <CardMenu
                        items={[
                          ...(item.kind === "music" && item.preview_url
                            ? [
                                {
                                  label: playing ? "Stop" : "Play",
                                  onClick: () => togglePlay(item),
                                },
                              ]
                            : []),
                          ...(item.download_url
                            ? [
                                {
                                  label: "Download",
                                  href: `/api/media/download?url=${encodeURIComponent(item.download_url)}&type=${item.kind === "music" ? "music" : item.kind === "photo" ? "photo" : "video"}&filename=${encodeURIComponent(item.title || item.asset_id)}`,
                                },
                              ]
                            : []),
                          {
                            label: "Remove",
                            danger: true,
                            onClick: () => void removeFav(item),
                          },
                        ]}
                      />
                    </CardMenuSlot>
                    <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
                      {item.kind}
                      {dur ? ` · ${dur}` : ""}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-0.5 px-2.5 py-2">
                    <p className="truncate text-xs font-semibold">
                      {item.title || "Untitled"}
                    </p>
                    {item.author ? (
                      <p className="truncate text-[11px] text-[color:var(--muted)]">
                        {item.author}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : jobList.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[color:var(--line)] p-10 text-center text-sm text-[color:var(--muted)]">
          {tab === "clips"
            ? "No AI clips yet. Create one in AI Clipping."
            : "No AI videos yet. Create one in Creativity."}
        </p>
      ) : (
        <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {jobList.map((job) => {
            const dur = formatDuration(job.duration_seconds);
            const key = `video:${job.id}`;
            const liked = favKeys.has(key);
            const href =
              tab === "clips" ? `/dashboard/clipping` : `/dashboard/content`;
            return (
              <li
                key={job.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/25"
              >
                <div className="relative aspect-[9/16] w-full bg-black/40">
                  {job.thumbnail_url || job.preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        job.thumbnail_url || `/api/jobs/${job.id}/preview`
                      }
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
                      {job.status}
                    </div>
                  )}
                  <FavHeart
                    active={liked}
                    onToggle={() => void toggleJobFavorite(job)}
                  />
                  <CardMenuSlot>
                    <CardMenu
                      items={[
                        {
                          label: "Open",
                          href,
                        },
                        ...(job.preview_url || job.storage_path
                          ? [
                              {
                                label: "Preview",
                                href: `/api/jobs/${job.id}/preview`,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </CardMenuSlot>
                  <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
                    {job.status}
                    {dur ? ` · ${dur}` : ""}
                  </span>
                </div>
                <div className="min-w-0 space-y-0.5 px-2.5 py-2">
                  <p className="truncate text-xs font-semibold">
                    {job.title || "Untitled"}
                  </p>
                  <Link
                    href={href}
                    className="text-[11px] text-[color:var(--accent)] hover:underline"
                  >
                    Open studio
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
