"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VideoJob } from "@/lib/types";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";
import {
  JOB_STATUS_LABEL,
  QUEUE_STATUSES,
  jobProgressPercent,
  statusColor,
} from "@/lib/job-status";
import { useToast } from "@/components/ToastNotice";

const ASPECTS = [
  { id: "9:16", label: "9:16", hint: "Vertical" },
  { id: "16:9", label: "16:9", hint: "Wide" },
  { id: "1:1", label: "1:1", hint: "Square" },
] as const;

const DURATIONS = [
  { id: "auto", label: "Auto" },
  { id: "15", label: "15s" },
  { id: "30", label: "30s" },
  { id: "45", label: "45s" },
  { id: "60", label: "60s" },
  { id: "90", label: "90s" },
  { id: "120", label: "2 min" },
  { id: "180", label: "3 min" },
  { id: "300", label: "5 min" },
] as const;

type Aspect = (typeof ASPECTS)[number]["id"];
type DurationId = (typeof DURATIONS)[number]["id"];

function isCreativityJob(job: VideoJob) {
  const src = String(job.metadata?.source || "").toLowerCase();
  const pipe = String(job.metadata?.pipeline || "").toLowerCase();
  if (src === "reedit" || pipe === "reedit") {
    return String(job.metadata?.library || "creativity") !== "clipping";
  }
  if (src === "creativity" || pipe === "creativity") return true;
  if (!job.youtube_video_id && job.metadata?.publish === false) {
    if (src === "ai_clipping" || pipe === "ai_clipping") return false;
    return true;
  }
  return false;
}

function aspectOf(job: VideoJob): string {
  return String(job.metadata?.aspect_ratio || "9:16");
}

function titleOf(job: VideoJob): string {
  if (job.title?.trim()) return job.title.trim();
  return "Generating title…";
}

function durationLabel(job: VideoJob): string {
  if (job.metadata?.duration_auto && !job.duration_seconds) return "Auto";
  if (job.duration_seconds) return `${job.duration_seconds}s`;
  if (job.metadata?.duration_seconds) return `${job.metadata.duration_seconds}s`;
  return "Auto";
}

async function downloadVideo(jobId: string, filename: string) {
  try {
    const res = await fetch(`/api/jobs/${jobId}/preview?download=1`);
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(`/api/jobs/${jobId}/preview?download=1`, "_blank", "noopener,noreferrer");
  }
}

function PromptChip({
  label,
  value,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
        style={{
          borderColor: open ? "rgba(232,165,75,0.55)" : "var(--line)",
          background: open ? "rgba(232,165,75,0.14)" : "rgba(255,255,255,0.03)",
          color: open ? "var(--accent)" : "var(--fg)",
        }}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
          {label}
        </span>
        <span>{value}</span>
        <span className="text-[10px] text-[color:var(--muted)]" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-30 min-w-[140px] overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1.5 shadow-xl"
          role="listbox"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function CreativityStudio({ initialJobs }: { initialJobs: VideoJob[] }) {
  const [jobs, setJobs] = useState(() => initialJobs.filter(isCreativityJob));
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [durationId, setDurationId] = useState<DurationId>("auto");
  const [openChip, setOpenChip] = useState<"format" | "duration" | null>(null);
  const [creating, setCreating] = useState(false);
  const { show: toast, notice } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"create" | "library">("create");

  const activeJobs = useMemo(
    () => jobs.filter((j) => QUEUE_STATUSES.has(j.status)),
    [jobs],
  );
  const libraryJobs = useMemo(
    () => jobs.filter((j) => j.status === "ready" || j.status === "failed"),
    [jobs],
  );

  const refreshJobs = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("video_jobs")
      .select(
        "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds,storage_path,storage_bucket,metadata",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (data) {
      setJobs((data as VideoJob[]).filter(isCreativityJob));
    }
  }, []);

  useEffect(() => {
    setJobs(initialJobs.filter(isCreativityJob));
  }, [initialJobs]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = window.setInterval(() => {
      void refreshJobs();
    }, 2500);
    return () => window.clearInterval(t);
  }, [activeJobs.length, refreshJobs]);

  const durationChipLabel =
    DURATIONS.find((d) => d.id === durationId)?.label || "Auto";
  const aspectChipLabel = ASPECTS.find((a) => a.id === aspect)?.label || "9:16";

  async function createVideo() {
    const text = prompt.trim();
    if (text.length < 8) {
      toast("Describe the video in at least one sentence.", "error");
      return;
    }
    setCreating(true);
    setOpenChip(null);

    const duration_auto = durationId === "auto";
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: text,
        publish: false,
        source: "creativity",
        pipeline: "creativity",
        duration_auto,
        duration_seconds: duration_auto ? null : Number(durationId),
        aspect_ratio: aspect,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast(data.error || "Failed to start generation", "error");
      return;
    }
    setPrompt("");
    toast("Generation started", "info");
    setTab("library");
    await refreshJobs();
  }

  async function removeCreation(jobId: string) {
    if (!confirm("Remove this video from your library?")) return;
    setBusyId(jobId);
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      toast(data.error || "Failed to delete", "error");
      return;
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    toast("Video deleted.");
  }

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 pb-28">
      {notice}
      <header className="rise space-y-4">
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          Creativity
        </h1>
        <nav
          className="flex gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1"
          aria-label="Creativity sections"
        >
          {(
            [
              { id: "create" as const, label: "Create" },
              { id: "library" as const, label: "My creations" },
            ] as const
          ).map((item) => {
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
                style={{
                  background: on ? "rgba(232,165,75,0.16)" : "transparent",
                  color: on ? "var(--accent)" : "var(--muted)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "create" && (
        <section className="rise-delay">
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] focus-within:border-[color:rgba(232,165,75,0.45)]">
            <textarea
              className="min-h-[160px] w-full resize-y border-0 bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed outline-none placeholder:text-[color:var(--muted)]"
              placeholder="Describe the video you want…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void createVideo();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--line)] px-3 py-2.5">
              <PromptChip
                label="Format"
                value={aspectChipLabel}
                open={openChip === "format"}
                onOpenChange={(open) => setOpenChip(open ? "format" : null)}
              >
                {ASPECTS.map((a) => {
                  const on = aspect === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/5"
                      style={{ color: on ? "var(--accent)" : "var(--fg)" }}
                      onClick={() => {
                        setAspect(a.id);
                        setOpenChip(null);
                      }}
                    >
                      <span className="font-semibold">{a.label}</span>
                      <span className="text-xs text-[color:var(--muted)]">
                        {a.hint}
                      </span>
                    </button>
                  );
                })}
              </PromptChip>

              <PromptChip
                label="Time"
                value={durationChipLabel}
                open={openChip === "duration"}
                onOpenChange={(open) => setOpenChip(open ? "duration" : null)}
              >
                {DURATIONS.map((d) => {
                  const on = durationId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/5"
                      style={{ color: on ? "var(--accent)" : "var(--fg)" }}
                      onClick={() => {
                        setDurationId(d.id);
                        setOpenChip(null);
                      }}
                    >
                      <span className="font-semibold">{d.label}</span>
                      {d.id === "auto" && (
                        <span className="text-[10px] text-[color:var(--muted)]">
                          AI picks
                        </span>
                      )}
                    </button>
                  );
                })}
              </PromptChip>

              <div className="ml-auto">
                <button
                  type="button"
                  className="btn btn-primary px-5 text-sm"
                  disabled={creating || prompt.trim().length < 8}
                  onClick={() => void createVideo()}
                >
                  {creating ? "Starting…" : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "library" && (
        <section className="rise-delay space-y-4">
          {libraryJobs.length === 0 && activeJobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--line)] p-10 text-center text-sm text-[color:var(--muted)]">
              No videos yet. Create one in the Create tab.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[...activeJobs, ...libraryJobs].map((job) => {
                const failed = job.status === "failed";
                const busy = QUEUE_STATUSES.has(job.status);
                const canWatch =
                  Boolean(job.preview_url) ||
                  Boolean(job.storage_path) ||
                  job.status === "ready";
                const mediaSrc = `/api/jobs/${job.id}/preview`;
                const pct = jobProgressPercent(job.status);
                return (
                  <article
                    key={job.id}
                    className="group relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]"
                  >
                    <div className="relative aspect-[4/5] bg-black/50">
                      {canWatch && !failed && !busy ? (
                        <video
                          key={job.id}
                          src={mediaSrc}
                          poster={job.thumbnail_url || undefined}
                          className="h-full w-full object-contain bg-black"
                          controls
                          playsInline
                          preload="metadata"
                          controlsList="nodownload"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                          <p
                            className="text-sm font-semibold"
                            style={{
                              color: failed
                                ? "var(--danger)"
                                : statusColor(job.status),
                            }}
                          >
                            {failed
                              ? "Failed"
                              : JOB_STATUS_LABEL[job.status] || job.status}
                          </p>
                          {busy && (
                            <>
                              <p className="text-2xl font-bold tabular-nums">
                                {pct}%
                              </p>
                              <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    background: "var(--accent)",
                                  }}
                                />
                              </div>
                            </>
                          )}
                          {failed && job.error_message && (
                            <p className="line-clamp-3 text-xs text-[color:var(--muted)]">
                              {job.error_message}
                            </p>
                          )}
                        </div>
                      )}

                      {canWatch && !failed && !busy && (
                        <a
                          href={`/dashboard/editor/${job.id}`}
                          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </a>
                      )}

                      <CardMenuSlot>
                        <CardMenu
                          items={[
                            ...(canWatch && !failed && !busy
                              ? [
                                  {
                                    label: "Edit",
                                    href: `/dashboard/editor/${job.id}`,
                                  },
                                  {
                                    label: "Download",
                                    onClick: () =>
                                      void downloadVideo(
                                        job.id,
                                        `${(job.title || "orzuai").replace(/[^\w\-]+/g, "_").slice(0, 40)}.mp4`,
                                      ),
                                  },
                                  {
                                    label: "Open",
                                    href: mediaSrc,
                                  },
                                ]
                              : []),
                            {
                              label: busyId === job.id ? "Deleting…" : "Delete",
                              danger: true,
                              disabled: busyId === job.id || busy,
                              onClick: () => void removeCreation(job.id),
                            },
                          ]}
                        />
                      </CardMenuSlot>
                    </div>

                    <div className="space-y-1 border-t border-[color:var(--line)] p-3">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {titleOf(job)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--muted)]">
                        <span>{aspectOf(job)}</span>
                        <span>·</span>
                        <span>{durationLabel(job)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
