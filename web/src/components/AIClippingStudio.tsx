"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
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
  { id: "9:16", label: "9:16", hint: "Shorts / Reels" },
  { id: "16:9", label: "16:9", hint: "Landscape" },
  { id: "1:1", label: "1:1", hint: "Square" },
] as const;

const DURATIONS = [
  { id: 15, label: "15s" },
  { id: 30, label: "30s" },
  { id: 45, label: "45s" },
  { id: 60, label: "60s" },
] as const;

type Aspect = (typeof ASPECTS)[number]["id"];

function isClippingJob(job: VideoJob) {
  const src = String(job.metadata?.source || "").toLowerCase();
  const pipe = String(job.metadata?.pipeline || "").toLowerCase();
  return src === "ai_clipping" || pipe === "ai_clipping" || src === "clipping";
}

function clipStatusLabel(status: string): string {
  switch (status) {
    case "generating_script":
      return "Analyzing";
    case "generating_voice":
      return "Captions";
    case "fetching_media":
      return "Music";
    case "editing":
      return "Cutting";
    case "uploading":
      return "Saving";
    default:
      return JOB_STATUS_LABEL[status] || status;
  }
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

function Toggle({
  on,
  label,
  detail,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  detail: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition"
      style={{
        borderColor: on ? "rgba(232,165,75,0.5)" : "var(--line)",
        background: on ? "rgba(232,165,75,0.1)" : "rgba(255,255,255,0.02)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold"
        style={{
          borderColor: on ? "var(--accent)" : "var(--line)",
          background: on ? "var(--accent)" : "transparent",
          color: on ? "#1a1208" : "var(--muted)",
        }}
        aria-hidden
      >
        {on ? "✓" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[color:var(--fg)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{detail}</span>
      </span>
    </button>
  );
}

export function AIClippingStudio({ initialJobs }: { initialJobs: VideoJob[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState(() => initialJobs.filter(isClippingJob));
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [duration, setDuration] = useState<number>(30);
  const [addSubtitles, setAddSubtitles] = useState(true);
  const [addMusic, setAddMusic] = useState(true);
  const [addEffects, setAddEffects] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show: toast, notice } = useToast();

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
    if (data) setJobs((data as VideoJob[]).filter(isClippingJob));
  }, []);

  useEffect(() => {
    setJobs(initialJobs.filter(isClippingJob));
  }, [initialJobs]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = window.setInterval(() => {
      void refreshJobs();
    }, 2500);
    return () => window.clearInterval(t);
  }, [activeJobs.length, refreshJobs]);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  function pickFile(next: File | null) {
    if (localUrl) URL.revokeObjectURL(localUrl);
    if (!next) {
      setFile(null);
      setLocalUrl(null);
      return;
    }
    setFile(next);
    setLocalUrl(URL.createObjectURL(next));
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    pickFile(f);
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function startClip() {
    if (!file) {
      toast("Upload a video from your device first.", "error");
      return;
    }
    setCreating(true);
    const body = new FormData();
    body.set("file", file);
    body.set("aspect_ratio", aspect);
    body.set("duration_seconds", String(duration));
    body.set("add_subtitles", addSubtitles ? "1" : "0");
    body.set("add_music", addMusic ? "1" : "0");
    body.set("add_effects", addEffects ? "1" : "0");
    if (instructions.trim()) body.set("instructions", instructions.trim());

    const res = await fetch("/api/clipping", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      toast(data.error || "Failed to start clipping", "error");
      return;
    }
    pickFile(null);
    setInstructions("");
    toast("Clipping started — the short will appear below.", "info");
    await refreshJobs();
  }

  async function removeJob(jobId: string) {
    if (!confirm("Remove this clip?")) return;
    setBusyId(jobId);
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      toast(data.error || "Failed to delete", "error");
      return;
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    toast("Clip deleted.");
  }

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-10 pb-16">
      {notice}

      <header className="rise space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
          Studio
        </p>
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          AI Clipping
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-[color:var(--muted)]">
          Upload a long video. AI finds the strongest moment, reframes it, and
          builds a short with captions, music, and polish.
        </p>
      </header>

      <section className="rise-delay space-y-5">
        {/* Upload */}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={onFileInput}
        />

        {!file ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center transition"
            style={{
              borderColor: dragOver ? "rgba(232,165,75,0.65)" : "var(--line)",
              background: dragOver
                ? "rgba(232,165,75,0.08)"
                : "rgba(255,255,255,0.02)",
            }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full border text-lg"
              style={{ borderColor: "var(--line)", color: "var(--accent)" }}
              aria-hidden
            >
              ↑
            </span>
            <span className="text-base font-semibold text-[color:var(--fg)]">
              Drop a long video here
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              or click to choose from your device · MP4 / MOV · max 200 MB
            </span>
          </button>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]">
            <div className="relative aspect-video bg-black/40">
              {localUrl && (
                <video
                  src={localUrl}
                  controls
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--line)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-[color:var(--muted)]">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => pickFile(null)}
                disabled={creating}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Controls — always visible for clarity */}
        <div className="space-y-5 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Format
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((a) => {
                const on = aspect === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={creating}
                    onClick={() => setAspect(a.id)}
                    className="rounded-xl border px-3 py-3 text-center transition"
                    style={{
                      borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                      background: on ? "rgba(232,165,75,0.12)" : "transparent",
                    }}
                  >
                    <span className="block text-sm font-bold" style={{ color: on ? "var(--accent)" : "var(--fg)" }}>
                      {a.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[color:var(--muted)]">
                      {a.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Length
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => {
                const on = duration === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={creating}
                    onClick={() => setDuration(d.id)}
                    className="min-w-[4.5rem] rounded-full border px-4 py-2 text-sm font-semibold transition"
                    style={{
                      borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                      background: on ? "rgba(232,165,75,0.14)" : "transparent",
                      color: on ? "var(--accent)" : "var(--fg)",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              on={addSubtitles}
              disabled={creating}
              label="Subtitles"
              detail="If speech is found"
              onChange={setAddSubtitles}
            />
            <Toggle
              on={addMusic}
              disabled={creating}
              label="Music"
              detail="Energy bed under voice"
              onChange={setAddMusic}
            />
            <Toggle
              on={addEffects}
              disabled={creating}
              label="Effects"
              detail="Grade, fade, punch"
              onChange={setAddEffects}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Instructions <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              className="field min-h-[88px] w-full resize-y text-sm"
              placeholder="e.g. focus on the funny part at the end, keep energy high…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={creating}
              maxLength={800}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary w-full sm:w-auto"
            disabled={creating || !file}
            onClick={() => void startClip()}
          >
            {creating ? "Uploading…" : "Create short clip"}
          </button>
        </div>
      </section>

      {/* Active */}
      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            In progress
          </h2>
          <ul className="space-y-2">
            {activeJobs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {job.title || "AI Clip"}
                    </p>
                    <p className="text-xs" style={{ color: statusColor(job.status) }}>
                      {clipStatusLabel(job.status)}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-[color:var(--muted)]">
                    {jobProgressPercent(job.status)}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${jobProgressPercent(job.status)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Library */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Library
        </h2>
        {libraryJobs.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            Your clipped shorts will show up here.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {libraryJobs.map((job) => {
              const ready = job.status === "ready" && job.preview_url;
              return (
                <li
                  key={job.id}
                  className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]"
                >
                  <div className="relative aspect-[9/16] max-h-[320px] bg-black/50 sm:aspect-video sm:max-h-none">
                    {ready ? (
                      <video
                        src={`/api/jobs/${job.id}/preview`}
                        controls
                        className="h-full w-full object-contain"
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-[color:var(--muted)]">
                        {job.error_message || "Failed"}
                      </div>
                    )}
                    <div className="absolute right-2 top-2">
                      <CardMenuSlot>
                        <CardMenu
                          items={[
                            ...(ready
                              ? [
                                  {
                                    label: "Download",
                                    onClick: () =>
                                      void downloadVideo(
                                        job.id,
                                        `${(job.title || "clip").replace(/\s+/g, "_")}.mp4`,
                                      ),
                                  },
                                ]
                              : []),
                            {
                              label: "Delete",
                              danger: true,
                              disabled: busyId === job.id,
                              onClick: () => void removeJob(job.id),
                            },
                          ]}
                        />
                      </CardMenuSlot>
                    </div>
                  </div>
                  <div className="space-y-1 border-t border-[color:var(--line)] px-3.5 py-3">
                    <p className="truncate text-sm font-semibold">
                      {job.title || "AI Clip"}
                    </p>
                    <p className="text-xs text-[color:var(--muted)]">
                      {job.duration_seconds ? `${job.duration_seconds}s` : "—"}
                      {" · "}
                      {String(job.metadata?.aspect_ratio || "9:16")}
                      {" · "}
                      <span style={{ color: statusColor(job.status) }}>
                        {clipStatusLabel(job.status)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
