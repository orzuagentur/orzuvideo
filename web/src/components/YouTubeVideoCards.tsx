"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoJob } from "@/lib/types";
import { JOB_STATUS_LABEL, statusColor } from "@/lib/job-status";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";

type YtComment = {
  id: string;
  commentId?: string;
  author: string;
  avatar: string | null;
  text: string;
  likes: number;
  publishedAt: string | null;
  replyCount: number;
  ourReply?: string | null;
  repliedByUs?: boolean;
  replies?: Array<{
    id: string;
    author: string;
    text: string;
    authorChannelId?: string | null;
    publishedAt?: string | null;
    likeCount?: number;
  }>;
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

function formatDurationLabel(sec: number | null | undefined) {
  const s = Number(sec ?? 0);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${m}m`;
}

function kindLabel(sec: number | null | undefined) {
  const s = Number(sec ?? 0);
  if (!Number.isFinite(s) || s <= 0) return null;
  return s <= 60 ? "Short" : "Video";
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

  // Engagement counts come from DB / 24h channel sync — no per-mount YouTube API.

  if (liveJobs.length === 0) {
    return (
      <p className="rounded-xl border border-[color:var(--line)] p-8 text-center text-sm text-[color:var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4">
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
              className="group relative flex flex-col overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elevated)] transition hover:border-[color:rgba(232,165,75,0.35)] sm:rounded-xl"
            >
              {menuItems.length > 0 && (
                <div className="hidden sm:contents">
                  <CardMenuSlot>
                    <CardMenu items={menuItems} />
                  </CardMenuSlot>
                </div>
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
                    <div className="flex h-full items-center justify-center text-[10px] text-[color:var(--muted)] sm:text-sm">
                      {JOB_STATUS_LABEL[job.status] || job.status}
                    </div>
                  )}
                  {canPlay && (
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 sm:flex">
                      <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-black">
                        Play
                      </span>
                    </span>
                  )}
                  <span
                    className="absolute left-1 top-1 rounded px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide sm:left-2 sm:top-2 sm:rounded-md sm:px-2 sm:text-[10px]"
                    style={{
                      color: statusColor(job.status),
                      background: "rgba(0,0,0,0.72)",
                    }}
                  >
                    {JOB_STATUS_LABEL[job.status] || job.status}
                  </span>
                  {(kindLabel(job.duration_seconds) ||
                    formatDurationLabel(job.duration_seconds)) && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[8px] font-medium text-white sm:bottom-2 sm:right-2 sm:rounded-md sm:px-2 sm:text-[10px]">
                      {[
                        kindLabel(job.duration_seconds),
                        formatDurationLabel(job.duration_seconds),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-1.5 sm:space-y-2 sm:p-3">
                  <h3 className="line-clamp-2 min-h-0 text-[10px] font-semibold leading-snug sm:min-h-[2.5rem] sm:text-sm">
                    {job.title || "Untitled"}
                  </h3>
                  <div className="hidden grid-cols-3 gap-1 text-center text-[11px] text-[color:var(--muted)] sm:grid">
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
                  <p className="hidden text-[11px] text-[color:var(--muted)] sm:block">
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
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [comments, setComments] = useState<YtComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [busyComment, setBusyComment] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    if (!job.youtube_video_id) {
      setComments([]);
      setCommentsLoaded(true);
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
      setCommentsLoaded(true);
    } catch {
      setCommentError("Could not load comments");
    } finally {
      setLoadingComments(false);
    }
  }, [job.youtube_video_id]);

  async function sendReply(c: YtComment, mode: "manual" | "ai") {
    const commentId = c.commentId || c.id;
    if (!job.youtube_video_id || !commentId) return;
    const text = (replyDraft[commentId] || "").trim();
    if (mode === "manual" && text.length < 1) {
      setActionError("Write a reply first.");
      return;
    }
    setBusyComment(`${commentId}:${mode}`);
    setActionError(null);
    try {
      const res = await fetch("/api/youtube/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: job.youtube_video_id,
          commentId,
          mode,
          text,
          author: c.author,
          commentText: c.text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to reply");
        return;
      }
      setReplyDraft((prev) => ({ ...prev, [commentId]: "" }));
      await loadComments();
    } catch {
      setActionError("Failed to reply");
    } finally {
      setBusyComment(null);
    }
  }

  useEffect(() => {
    if (!showComments || commentsLoaded || loadingComments) return;
    void loadComments();
  }, [showComments, commentsLoaded, loadingComments, loadComments]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showComments) setShowComments(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showComments]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const menuItems = [
    ...(job.youtube_url
      ? [
          {
            label: "Open on YouTube",
            href: job.youtube_url,
          },
        ]
      : []),
    ...(onPublish
      ? [
          {
            label: "Publish to YouTube",
            onClick: () => {
              setMenuOpen(false);
              onPublish();
            },
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            label: deleting ? "Deleting..." : "Delete",
            danger: true as const,
            disabled: deleting,
            onClick: () => {
              setMenuOpen(false);
              onDelete();
            },
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex max-h-[min(92vh,880px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={job.title || "Video"}
      >
        {/* Top controls */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Comments"
              aria-label="Comments"
              aria-pressed={showComments}
              onClick={() => setShowComments((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black/85"
              style={{
                boxShadow: showComments
                  ? "0 0 0 2px rgba(232,165,75,0.55)"
                  : undefined,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            {menuItems.length > 0 && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  title="More"
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black/85"
                  style={{
                    boxShadow: menuOpen
                      ? "0 0 0 2px rgba(232,165,75,0.55)"
                      : undefined,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
                {menuOpen && (
                  <div
                    className="absolute left-0 top-11 z-30 w-48 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1.5 shadow-2xl"
                    role="menu"
                  >
                    {menuItems.map((item) =>
                      item.href ? (
                        <a
                          key={item.label}
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          role="menuitem"
                          className="block rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-white/5"
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <button
                          key={item.label}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          className="flex w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/5 disabled:opacity-50"
                          style={
                            item.danger ? { color: "var(--danger)" } : undefined
                          }
                          onClick={item.onClick}
                        >
                          {item.label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Close"
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black/85"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Video only */}
        <div
          className={`relative flex min-h-0 flex-1 items-center justify-center bg-black ${
            showComments ? "max-h-[42%]" : ""
          }`}
        >
          {job.youtube_video_id ? (
            <div className="aspect-[9/16] h-full max-h-[min(78vh,720px)] w-full">
              <iframe
                title={job.title || "preview"}
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${job.youtube_video_id}?autoplay=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : job.preview_url ? (
            <div className="aspect-[9/16] h-full max-h-[min(78vh,720px)] w-full">
              <video
                src={job.preview_url}
                className="h-full w-full object-contain"
                controls
                playsInline
              />
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[color:var(--muted)]">
              Preview available after generation finishes.
              <br />
              Status: {JOB_STATUS_LABEL[job.status] || job.status}
            </div>
          )}
        </div>

        {/* Comments panel inside the same card */}
        {showComments && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-[color:var(--line)] bg-[color:var(--bg-elevated)]">
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line)] px-3 py-2.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">Comments</h3>
                <p className="truncate text-[11px] text-[color:var(--muted)]">
                  {job.title || "Untitled"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--fg)]"
                  onClick={() => void loadComments()}
                  disabled={loadingComments || !job.youtube_video_id}
                >
                  {loadingComments ? "…" : "Refresh"}
                </button>
                <button
                  type="button"
                  title="Close comments"
                  aria-label="Close comments"
                  onClick={() => setShowComments(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--fg)]"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {!job.youtube_video_id ? (
                <p className="text-sm text-[color:var(--muted)]">
                  Comments appear after the video is published.
                </p>
              ) : commentError ? (
                <p className="text-sm text-[color:var(--danger)]">{commentError}</p>
              ) : loadingComments && !commentsLoaded ? (
                <p className="text-sm text-[color:var(--muted)]">
                  Loading comments...
                </p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-[color:var(--muted)]">No comments yet.</p>
              ) : (
                <ul className="space-y-4">
                  {actionError && (
                    <li className="text-xs text-[color:var(--danger)]">
                      {actionError}
                    </li>
                  )}
                  {comments.map((c) => {
                    const cid = c.commentId || c.id;
                    const busy = busyComment?.startsWith(cid);
                    return (
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
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <p className="text-xs text-[color:var(--muted)]">
                              <span className="font-medium text-[color:var(--fg)]">
                                {c.author}
                              </span>
                              {c.publishedAt
                                ? ` · ${formatFixedDate(c.publishedAt)}`
                                : ""}
                              {c.repliedByUs ? " · Replied" : ""}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">
                              {c.text}
                            </p>
                            <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                              {c.likes} likes
                              {c.replyCount ? ` · ${c.replyCount} replies` : ""}
                            </p>
                          </div>

                          {c.ourReply && (
                            <div className="rounded-lg border border-[color:var(--line)] bg-black/20 px-2.5 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                                Your reply
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                                {c.ourReply}
                              </p>
                            </div>
                          )}

                          {(c.replies || []).length > 0 && (
                            <ul className="space-y-2 border-l border-[color:var(--line)] pl-3">
                              {(c.replies || []).map((r) => (
                                <li
                                  key={
                                    r.id || `${r.author}-${r.text.slice(0, 24)}`
                                  }
                                >
                                  <p className="text-[11px] text-[color:var(--muted)]">
                                    <span className="font-medium text-[color:var(--fg)]">
                                      {r.author}
                                    </span>
                                    {r.publishedAt
                                      ? ` · ${formatFixedDate(r.publishedAt)}`
                                      : ""}
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">
                                    {r.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="space-y-1.5">
                            <textarea
                              className="field min-h-[56px] w-full text-sm"
                              placeholder={
                                c.repliedByUs
                                  ? "Reply again to this thread…"
                                  : "Write a reply..."
                              }
                              value={replyDraft[cid] || ""}
                              disabled={Boolean(busy)}
                              onChange={(e) =>
                                setReplyDraft((prev) => ({
                                  ...prev,
                                  [cid]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn btn-primary text-xs"
                                disabled={Boolean(busy)}
                                onClick={() => void sendReply(c, "manual")}
                              >
                                {busyComment === `${cid}:manual`
                                  ? "Sending..."
                                  : "Reply"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost text-xs"
                                disabled={Boolean(busy)}
                                onClick={() => void sendReply(c, "ai")}
                              >
                                {busyComment === `${cid}:ai`
                                  ? "AI writing..."
                                  : "AI reply"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
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
