"use client";

import { useCallback, useEffect, useState } from "react";
import type { VideoJob } from "@/lib/types";
import { JOB_STATUS_LABEL, statusColor } from "@/lib/job-status";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";

type YtComment = {
  id: string;
  author: string;
  avatar: string | null;
  text: string;
  likes: number;
  publishedAt: string | null;
  replyCount: number;
};

function thumbUrl(job: VideoJob) {
  if (job.thumbnail_url) return job.thumbnail_url;
  if (job.youtube_video_id) {
    return `https://i.ytimg.com/vi/${job.youtube_video_id}/hqdefault.jpg`;
  }
  return null;
}

function formatCount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

export function YouTubeVideoCards({
  jobs,
  onDelete,
  onPublish,
  busyId,
  emptyLabel = "No videos yet.",
}: {
  jobs: VideoJob[];
  onDelete?: (youtubeVideoId: string) => void;
  onPublish?: (jobId: string) => void;
  busyId?: string | null;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState<VideoJob | null>(null);
  const [liveJobs, setLiveJobs] = useState(jobs);

  useEffect(() => {
    setLiveJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    const published = jobs.filter((j) => j.youtube_video_id && j.status === "published");
    if (published.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/youtube/video-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: published.map((j) => j.id) }),
        });
        const data = await res.json();
        if (!res.ok || cancelled || !Array.isArray(data.items)) return;
        setLiveJobs((prev) =>
          prev.map((j) => {
            const hit = data.items.find(
              (i: { id: string }) => i.id === j.id,
            ) as
              | {
                  id: string;
                  view_count: number;
                  like_count: number;
                  comment_count: number;
                  thumbnail_url?: string | null;
                  title?: string;
                }
              | undefined;
            if (!hit) return j;
            return {
              ...j,
              view_count: hit.view_count,
              like_count: hit.like_count,
              comment_count: hit.comment_count,
              thumbnail_url: hit.thumbnail_url || j.thumbnail_url,
              title: hit.title || j.title,
            };
          }),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  if (liveJobs.length === 0) {
    return (
      <p className="rounded-xl border border-[color:var(--line)] p-8 text-center text-sm text-[color:var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {liveJobs.map((job) => {
          const thumb = thumbUrl(job);
          const canPlay = Boolean(job.youtube_video_id || job.preview_url);
          const menuItems = [
            ...(job.youtube_url
              ? [{ label: "YouTube", href: job.youtube_url }]
              : []),
            ...(onDelete && job.youtube_video_id
              ? [
                  {
                    label: busyId === job.youtube_video_id ? "Deleting..." : "Delete",
                    danger: true as const,
                    disabled: busyId === job.youtube_video_id,
                    onClick: () => onDelete(job.youtube_video_id!),
                  },
                ]
              : []),
          ];

          return (
            <article
              key={job.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] transition hover:border-[color:rgba(232,165,75,0.35)]"
            >
              {menuItems.length > 0 && (
                <CardMenuSlot>
                  <CardMenu items={menuItems} />
                </CardMenuSlot>
              )}

              <button
                type="button"
                className="relative block w-full flex-1 text-left"
                onClick={() => setOpen(job)}
              >
                <div className="relative aspect-video overflow-hidden bg-black/40">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : job.preview_url ? (
                    <video
                      src={job.preview_url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
                      {JOB_STATUS_LABEL[job.status] || job.status}
                    </div>
                  )}
                  {canPlay && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                      <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-black">
                        Play
                      </span>
                    </span>
                  )}
                  <span
                    className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{
                      color: statusColor(job.status),
                      background: "rgba(0,0,0,0.72)",
                    }}
                  >
                    {JOB_STATUS_LABEL[job.status] || job.status}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
                    {job.title || "Untitled Short"}
                  </h3>
                  <div className="grid grid-cols-3 gap-1 text-center text-[11px] text-[color:var(--muted)]">
                    <div className="rounded-md bg-black/20 px-1 py-1.5">
                      <p className="font-semibold text-[color:var(--fg)]">
                        {formatCount(job.view_count)}
                      </p>
                      <p>views</p>
                    </div>
                    <div className="rounded-md bg-black/20 px-1 py-1.5">
                      <p className="font-semibold text-[color:var(--fg)]">
                        {formatCount(job.like_count)}
                      </p>
                      <p>likes</p>
                    </div>
                    <div className="rounded-md bg-black/20 px-1 py-1.5">
                      <p className="font-semibold text-[color:var(--fg)]">
                        {formatCount(job.comment_count)}
                      </p>
                      <p>comments</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[color:var(--muted)]">
                    {formatFixedDate(job.completed_at || job.created_at)}
                  </p>
                </div>
              </button>
            </article>
          );
        })}
      </div>

      {open && (
        <VideoDetailModal
          job={open}
          onClose={() => setOpen(null)}
          onDelete={
            onDelete && open.youtube_video_id
              ? () => {
                  onDelete(open.youtube_video_id!);
                  setOpen(null);
                }
              : undefined
          }
          onPublish={
            onPublish && open.status === "ready"
              ? () => {
                  onPublish(open.id);
                  setOpen(null);
                }
              : undefined
          }
          deleting={busyId === open.youtube_video_id || busyId === open.id}
        />
      )}
    </>
  );
}

function VideoDetailModal({
  job,
  onClose,
  onDelete,
  onPublish,
  deleting,
}: {
  job: VideoJob;
  onClose: () => void;
  onDelete?: () => void;
  onPublish?: () => void;
  deleting?: boolean;
}) {
  const [comments, setComments] = useState<YtComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    if (!job.youtube_video_id) {
      setComments([]);
      return;
    }
    setLoadingComments(true);
    setCommentError(null);
    try {
      const res = await fetch(
        `/api/youtube/comments?videoId=${encodeURIComponent(job.youtube_video_id)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setCommentError(data.error || "Could not load comments");
        setComments([]);
        return;
      }
      setComments(data.comments || []);
    } catch {
      setCommentError("Could not load comments");
    } finally {
      setLoadingComments(false);
    }
  }, [job.youtube_video_id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{job.title || "Untitled"}</h2>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {formatCount(job.view_count)} views · {formatCount(job.like_count)} likes ·{" "}
              {formatCount(job.comment_count)} comments
            </p>
          </div>
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4 border-b border-[color:var(--line)] p-4 lg:border-b-0 lg:border-r">
            {job.youtube_video_id ? (
              <div className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-sm overflow-hidden rounded-xl bg-black">
                <iframe
                  title="preview"
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${job.youtube_video_id}?autoplay=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : job.preview_url ? (
              <div className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-sm overflow-hidden rounded-xl bg-black">
                <video
                  src={job.preview_url}
                  className="h-full w-full"
                  controls
                  playsInline
                />
              </div>
            ) : (
              <div className="rounded-xl border border-[color:var(--line)] p-6 text-sm text-[color:var(--muted)]">
                Preview available after the worker finishes. Status:{" "}
                {JOB_STATUS_LABEL[job.status] || job.status}
              </div>
            )}

            {job.script_text && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--muted)]">
                  Script
                </p>
                <p className="max-h-36 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                  {job.script_text}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {onPublish && (
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  disabled={deleting}
                  onClick={onPublish}
                >
                  Publish to YouTube
                </button>
              )}
              {job.youtube_url && (
                <a
                  href={job.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost text-sm"
                >
                  Open on YouTube
                </a>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  style={{ color: "var(--danger)" }}
                  disabled={deleting}
                  onClick={onDelete}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Comments</h3>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => void loadComments()}
                disabled={loadingComments || !job.youtube_video_id}
              >
                {loadingComments ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!job.youtube_video_id ? (
              <p className="text-sm text-[color:var(--muted)]">
                Comments appear after the Short is published.
              </p>
            ) : commentError ? (
              <p className="text-sm text-[color:var(--danger)]">{commentError}</p>
            ) : loadingComments ? (
              <p className="text-sm text-[color:var(--muted)]">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-[color:var(--muted)]">No comments yet.</p>
            ) : (
              <ul className="space-y-3 overflow-auto pr-1">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatar}
                        alt=""
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px]">
                        YT
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[color:var(--muted)]">
                        <span className="font-medium text-[color:var(--fg)]">{c.author}</span>
                        {c.publishedAt
                          ? ` · ${formatFixedDate(c.publishedAt)}`
                          : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{c.text}</p>
                      <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                        {c.likes} likes
                        {c.replyCount ? ` · ${c.replyCount} replies` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Locale-independent date so SSR and client match. */
function formatFixedDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
