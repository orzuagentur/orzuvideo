"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { clippingSourcePath, MEDIA_BUCKET } from "@/lib/storage";
import { VoicePicker } from "@/components/VoicePicker";
import { SUBTITLE_STYLES } from "@/lib/editor-catalog";
import {
  SubtitleStyleCard,
  type SubtitleStyleId,
} from "@/components/SubtitleStylePicker";

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

const MAX_SOURCES = 6;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — matches storage bucket for clipping sources
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

type Aspect = (typeof ASPECTS)[number]["id"];

type ClipSource = {
  id: string;
  kind: "device" | "media";
  title: string;
  previewUrl: string | null;
  file?: File;
  mediaId?: string;
  provider?: string;
  downloadUrl?: string | null;
  storagePath?: string | null;
  storageBucket?: string | null;
};

function isClippingJob(job: VideoJob) {
  const src = String(job.metadata?.source || "").toLowerCase();
  const pipe = String(job.metadata?.pipeline || "").toLowerCase();
  if (src === "reedit" || pipe === "reedit") {
    return String(job.metadata?.library || "") === "clipping";
  }
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

function uid() {
  return crypto.randomUUID();
}

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
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
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 py-2 text-center transition sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2.5"
      style={{
        borderColor: on ? "rgba(232,165,75,0.5)" : "var(--line)",
        background: on ? "rgba(232,165,75,0.1)" : "rgba(255,255,255,0.02)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-bold sm:h-5 sm:w-5 sm:rounded-md sm:text-[11px]"
        style={{
          borderColor: on ? "var(--accent)" : "var(--line)",
          background: on ? "var(--accent)" : "transparent",
          color: on ? "#1a1208" : "var(--muted)",
        }}
        aria-hidden
      >
        {on ? "✓" : ""}
      </span>
      <span className="truncate text-[11px] font-semibold sm:text-sm">
        {label}
      </span>
    </button>
  );
}

export function AIClippingStudio({ initialJobs }: { initialJobs: VideoJob[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabRaw = searchParams.get("tab");
  const tab: "create" | "clips" =
    tabRaw === "clips" || tabRaw === "create" ? tabRaw : "create";
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState(() => initialJobs.filter(isClippingJob));
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [duration, setDuration] = useState(30);
  const [useVoice, setUseVoice] = useState(true);
  const [voiceId, setVoiceId] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [addMusic, setAddMusic] = useState(true);
  const [addSubtitles, setAddSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] =
    useState<SubtitleStyleId>("classic");
  const [subsOpen, setSubsOpen] = useState(false);
  const [musicTrackId, setMusicTrackId] = useState("");
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicTracks, setMusicTracks] = useState<
    Array<{
      id: string;
      name: string;
      artist: string;
      previewUrl: string | null;
    }>
  >([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicPlayingId, setMusicPlayingId] = useState<string | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [watchSource, setWatchSource] = useState<ClipSource | null>(null);
  const { show: toast, notice } = useToast();

  const activeJobs = useMemo(
    () => jobs.filter((j) => QUEUE_STATUSES.has(j.status)),
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
    if (!addMusic) return;
    let cancelled = false;
    setMusicLoading(true);
    void (async () => {
      // Main shared platform music library (same catalog as AI Training)
      const res = await fetch("/api/music/group", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setMusicLoading(false);
      if (!res.ok) {
        setMusicTracks([]);
        return;
      }
      const tracks = (
        (data.tracks || []) as Array<{
          id: string;
          name?: string;
          artist?: string | null;
          previewUrl?: string | null;
        }>
      ).map((t) => ({
        id: String(t.id),
        name: t.name || "Track",
        artist: t.artist || "Library",
        previewUrl: t.previewUrl || null,
      }));
      setMusicTracks(tracks);
    })();
    return () => {
      cancelled = true;
    };
  }, [addMusic]);

  useEffect(() => {
    return () => {
      musicAudioRef.current?.pause();
    };
  }, []);

  function toggleMusicPreview(track: {
    id: string;
    previewUrl: string | null;
  }) {
    if (!track.previewUrl) return;
    if (musicPlayingId === track.id) {
      musicAudioRef.current?.pause();
      setMusicPlayingId(null);
      return;
    }
    musicAudioRef.current?.pause();
    const audio = new Audio(track.previewUrl);
    musicAudioRef.current = audio;
    audio.onended = () => setMusicPlayingId(null);
    void audio.play().then(() => setMusicPlayingId(track.id));
  }

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = window.setInterval(() => void refreshJobs(), 2500);
    return () => window.clearInterval(t);
  }, [activeJobs.length, refreshJobs]);

  useEffect(() => {
    return () => {
      sources.forEach((s) => {
        if (s.kind === "device" && s.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(s.previewUrl);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addDeviceFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const room = MAX_SOURCES - sources.length;
    if (room <= 0) {
      toast(`Maximum ${MAX_SOURCES} videos`, "error");
      return;
    }
    const next: ClipSource[] = [];
    for (const file of list.slice(0, room)) {
      const name = file.name.toLowerCase();
      if (
        !file.type.includes("video") &&
        !name.endsWith(".mp4") &&
        !name.endsWith(".mov") &&
        !name.endsWith(".webm")
      ) {
        toast(`${file.name}: use MP4 / MOV / WebM`, "error");
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast(
          `${file.name}: ${formatMb(file.size)} MB â€” max is ${MAX_MB} MB`,
          "error",
        );
        continue;
      }
      next.push({
        id: uid(),
        kind: "device",
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    }
    if (next.length) setSources((prev) => [...prev, ...next]);
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addDeviceFiles(e.target.files);
    e.target.value = "";
  }

  function removeSource(id: string) {
    setSources((prev) => {
      const hit = prev.find((s) => s.id === id);
      if (hit?.kind === "device" && hit.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(hit.previewUrl);
      }
      return prev.filter((s) => s.id !== id);
    });
  }

  async function startClip() {
    if (sources.length === 0) {
      toast("Add at least one video first.", "error");
      return;
    }
    setCreating(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");

      const jobId = crypto.randomUUID();
      const payloadSources: Array<Record<string, unknown>> = [];

      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (s.kind === "device" && s.file) {
          const path = clippingSourcePath(user.id, jobId, i);
          const contentType = s.file.type || "video/mp4";
          const presignRes = await fetch("/api/storage/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: path,
              contentType,
              contentLength: s.file.size,
            }),
          });
          const presign = await presignRes.json().catch(() => ({}));
          if (!presignRes.ok) {
            throw new Error(presign.error || "R2 presign failed");
          }
          const putRes = await fetch(presign.uploadUrl as string, {
            method: "PUT",
            body: s.file,
            headers: { "Content-Type": contentType },
          });
          if (!putRes.ok) {
            throw new Error(`R2 upload failed (${putRes.status})`);
          }
          payloadSources.push({
            kind: "device",
            title: s.title,
            storage_path: path,
            storage_bucket: (presign.bucket as string) || MEDIA_BUCKET,
            url: presign.publicUrl as string,
          });
        } else if (s.kind === "media") {
          payloadSources.push({
            kind: "media",
            title: s.title,
            media_id: s.mediaId,
            provider: "library",
            download_url: s.downloadUrl,
            url: s.downloadUrl,
          });
        }
      }

      const res = await fetch("/api/clipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          sources: payloadSources,
          aspect_ratio: aspect,
          duration_seconds: duration,
          use_voice: useVoice,
          voice_id: useVoice ? voiceId || null : null,
          add_music: addMusic,
          music_group: null,
          music_track_id: addMusic ? musicTrackId || null : null,
          add_subtitles: addSubtitles,
          subtitle_style: addSubtitles ? subtitleStyle : null,
          instructions: instructions.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start clipping");

      sources.forEach((s) => {
        if (s.kind === "device" && s.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(s.previewUrl);
        }
      });
      setSources([]);
      setInstructions("");
      router.replace("/dashboard/clipping?tab=clips", { scroll: false });
      toast("Clip queued — see My clips.", "info");
      await refreshJobs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to start", "error");
    } finally {
      setCreating(false);
    }
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
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 pb-24">
      {notice}

      <header className="rise hidden sm:block">
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          AI Clipping
        </h1>
      </header>

      {tab === "create" && (
        <section className="rise-delay">
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            className="hidden"
            multiple
            onChange={onFileInput}
          />

          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            {/* Settings — below videos on mobile */}
            <div className="order-2 min-w-0 space-y-4 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-3 sm:order-1 sm:space-y-5 sm:p-5">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)] sm:mb-2">
                  Format
                </p>
                <p className="mb-1.5 text-[11px] text-[color:var(--muted)] sm:mb-2">
                  Output is locked to the format you pick.
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {ASPECTS.map((a) => {
                    const on = aspect === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={creating}
                        onClick={() => setAspect(a.id)}
                        className="rounded-lg border px-1.5 py-2 text-center transition sm:rounded-xl sm:px-3 sm:py-3"
                        style={{
                          borderColor: on
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: on
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                        }}
                      >
                        <span
                          className="block text-xs font-bold sm:text-sm"
                          style={{ color: on ? "var(--accent)" : "var(--fg)" }}
                        >
                          {a.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] text-[color:var(--muted)] sm:text-[11px]">
                          {a.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)] sm:mb-2">
                  Length
                </p>
                <p className="mb-1.5 text-[11px] text-[color:var(--muted)] sm:mb-2">
                  Clip is cut to this duration — not longer.
                </p>
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DURATIONS.map((d) => {
                    const on = duration === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={creating}
                        onClick={() => setDuration(d.id)}
                        className="rounded-full border px-1.5 py-1.5 text-xs font-semibold transition sm:min-w-[4.5rem] sm:px-4 sm:py-2 sm:text-sm"
                        style={{
                          borderColor: on
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: on
                            ? "rgba(232,165,75,0.14)"
                            : "transparent",
                          color: on ? "var(--accent)" : "var(--fg)",
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <Toggle
                  on={useVoice}
                  disabled={creating}
                  label="Voice"
                  onChange={setUseVoice}
                />
                <Toggle
                  on={addMusic}
                  disabled={creating}
                  label="Music"
                  onChange={setAddMusic}
                />
                <Toggle
                  on={addSubtitles}
                  disabled={creating}
                  label="Subtitles"
                  onChange={setAddSubtitles}
                />
              </div>

              {/* Mobile: Voice / Music / Subtitles picker chips in one row;
                  open list renders below so chip size never changes */}
              {(useVoice || addMusic || addSubtitles) && (
                <div className="space-y-2 sm:hidden">
                  <div className="flex gap-1.5">
                    {useVoice && (
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => {
                          const next = !voiceOpen;
                          setVoiceOpen(next);
                          if (next) {
                            setMusicOpen(false);
                            setSubsOpen(false);
                          }
                        }}
                        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center text-[11px] font-semibold transition"
                        style={{
                          borderColor: voiceOpen
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: voiceOpen
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                          color: voiceOpen ? "var(--accent)" : "var(--fg)",
                        }}
                      >
                        <span>Voice</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{
                            opacity: 0.7,
                            transform: voiceOpen ? "rotate(180deg)" : undefined,
                            transition: "transform 0.15s ease",
                          }}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    )}
                    {addMusic && (
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => {
                          const next = !musicOpen;
                          setMusicOpen(next);
                          if (next) {
                            setVoiceOpen(false);
                            setSubsOpen(false);
                          }
                        }}
                        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center text-[11px] font-semibold transition"
                        style={{
                          borderColor: musicOpen
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: musicOpen
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                          color: musicOpen ? "var(--accent)" : "var(--fg)",
                        }}
                      >
                        <span>Music</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{
                            opacity: 0.7,
                            transform: musicOpen ? "rotate(180deg)" : undefined,
                            transition: "transform 0.15s ease",
                          }}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    )}
                    {addSubtitles && (
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => {
                          const next = !subsOpen;
                          setSubsOpen(next);
                          if (next) {
                            setVoiceOpen(false);
                            setMusicOpen(false);
                          }
                        }}
                        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center text-[11px] font-semibold transition"
                        style={{
                          borderColor: subsOpen
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: subsOpen
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                          color: subsOpen ? "var(--accent)" : "var(--fg)",
                        }}
                      >
                        <span>Subtitles</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{
                            opacity: 0.7,
                            transform: subsOpen ? "rotate(180deg)" : undefined,
                            transition: "transform 0.15s ease",
                          }}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {useVoice && voiceOpen && (
                    <div className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)] p-2">
                      <VoicePicker
                        value={voiceId}
                        onChange={setVoiceId}
                        hideSearch
                        allowAuto
                      />
                    </div>
                  )}

                  {addMusic && musicOpen && (
                    <div className="min-w-0 space-y-2 overflow-hidden rounded-xl border border-[color:var(--line)] p-2">
                      {musicLoading ? (
                        <p className="text-xs text-[color:var(--muted)]">
                          Loading tracks…
                        </p>
                      ) : musicTracks.length === 0 ? (
                        <p className="text-xs text-[color:var(--muted)]">
                          No tracks available yet.
                        </p>
                      ) : (
                        <div className="max-h-[280px] space-y-1.5 overflow-y-auto overflow-x-hidden">
                          <button
                            type="button"
                            disabled={creating}
                            className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition"
                            style={{
                              background: !musicTrackId
                                ? "rgba(232,165,75,0.12)"
                                : "transparent",
                              border: `1px solid ${
                                !musicTrackId
                                  ? "rgba(232,165,75,0.45)"
                                  : "transparent"
                              }`,
                            }}
                            onClick={() => setMusicTrackId("")}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs">
                              ✦
                            </span>
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="block truncate text-sm font-medium">
                                Auto
                              </span>
                              <span className="block truncate text-[11px] text-[color:var(--muted)]">
                                AI picks a track
                              </span>
                            </span>
                            {!musicTrackId && (
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                                ✓
                              </span>
                            )}
                          </button>
                          {musicTracks.map((t) => {
                            const on = musicTrackId === t.id;
                            const playing = musicPlayingId === t.id;
                            return (
                              <div
                                key={t.id}
                                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5"
                                style={{
                                  background: on
                                    ? "rgba(232,165,75,0.12)"
                                    : "transparent",
                                  border: `1px solid ${
                                    on
                                      ? "rgba(232,165,75,0.45)"
                                      : "transparent"
                                  }`,
                                }}
                              >
                                <button
                                  type="button"
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                                  style={{
                                    background: playing
                                      ? "rgba(232,165,75,0.9)"
                                      : "rgba(255,255,255,0.08)",
                                    color: playing ? "#111" : "var(--fg)",
                                  }}
                                  disabled={!t.previewUrl || creating}
                                  aria-label={playing ? "Stop" : "Play"}
                                  onClick={() => toggleMusicPreview(t)}
                                >
                                  {playing ? "■" : "▶"}
                                </button>
                                <button
                                  type="button"
                                  disabled={creating}
                                  className="min-w-0 flex-1 overflow-hidden text-left"
                                  onClick={() => setMusicTrackId(t.id)}
                                >
                                  <span className="block truncate text-sm font-medium">
                                    {t.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-[color:var(--muted)]">
                                    {t.artist}
                                  </span>
                                </button>
                                {on && (
                                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                                    ✓
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {addSubtitles && subsOpen && (
                    <div className="rounded-xl border border-[color:var(--line)] p-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {SUBTITLE_STYLES.map((s) => (
                          <SubtitleStyleCard
                            key={s.id}
                            style={s}
                            active={subtitleStyle === s.id}
                            disabled={creating}
                            onSelect={() => setSubtitleStyle(s.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop: stacked accordions (unchanged behavior) */}
              <div className="hidden space-y-4 sm:block">
                {useVoice && (
                  <div className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)]">
                    <button
                      type="button"
                      disabled={creating}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      onClick={() => setVoiceOpen((v) => !v)}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          Voice
                        </span>
                        <span className="block truncate text-sm">
                          {voiceId ? "Custom voice" : "Auto — AI picks"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">
                        {voiceOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {voiceOpen && (
                      <div className="min-w-0 overflow-hidden border-t border-[color:var(--line)] p-3">
                        <VoicePicker
                          value={voiceId}
                          onChange={setVoiceId}
                          hideSearch
                          allowAuto
                        />
                      </div>
                    )}
                  </div>
                )}

                {addMusic && (
                  <div className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)]">
                    <button
                      type="button"
                      disabled={creating}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      onClick={() => setMusicOpen((v) => !v)}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          Music
                        </span>
                        <span className="block truncate text-sm">
                          {musicTrackId
                            ? musicTracks.find((t) => t.id === musicTrackId)
                                ?.name || "Selected track"
                            : "Auto"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">
                        {musicOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {musicOpen && (
                      <div className="min-w-0 space-y-2 overflow-hidden border-t border-[color:var(--line)] p-3">
                        {musicLoading ? (
                          <p className="text-xs text-[color:var(--muted)]">
                            Loading tracks…
                          </p>
                        ) : musicTracks.length === 0 ? (
                          <p className="text-xs text-[color:var(--muted)]">
                            No tracks available yet.
                          </p>
                        ) : (
                          <div className="max-h-[280px] space-y-1.5 overflow-y-auto overflow-x-hidden">
                            <button
                              type="button"
                              disabled={creating}
                              className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition"
                              style={{
                                background: !musicTrackId
                                  ? "rgba(232,165,75,0.12)"
                                  : "transparent",
                                border: `1px solid ${
                                  !musicTrackId
                                    ? "rgba(232,165,75,0.45)"
                                    : "transparent"
                                }`,
                              }}
                              onClick={() => setMusicTrackId("")}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs">
                                ✦
                              </span>
                              <span className="min-w-0 flex-1 overflow-hidden">
                                <span className="block truncate text-sm font-medium">
                                  Auto
                                </span>
                                <span className="block truncate text-[11px] text-[color:var(--muted)]">
                                  AI picks a track
                                </span>
                              </span>
                              {!musicTrackId && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                                  ✓
                                </span>
                              )}
                            </button>
                            {musicTracks.map((t) => {
                              const on = musicTrackId === t.id;
                              const playing = musicPlayingId === t.id;
                              return (
                                <div
                                  key={t.id}
                                  className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5"
                                  style={{
                                    background: on
                                      ? "rgba(232,165,75,0.12)"
                                      : "transparent",
                                    border: `1px solid ${
                                      on
                                        ? "rgba(232,165,75,0.45)"
                                        : "transparent"
                                    }`,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                                    style={{
                                      background: playing
                                        ? "rgba(232,165,75,0.9)"
                                        : "rgba(255,255,255,0.08)",
                                      color: playing ? "#111" : "var(--fg)",
                                    }}
                                    disabled={!t.previewUrl || creating}
                                    aria-label={playing ? "Stop" : "Play"}
                                    onClick={() => toggleMusicPreview(t)}
                                  >
                                    {playing ? "■" : "▶"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={creating}
                                    className="min-w-0 flex-1 overflow-hidden text-left"
                                    onClick={() => setMusicTrackId(t.id)}
                                  >
                                    <span className="block truncate text-sm font-medium">
                                      {t.name}
                                    </span>
                                    <span className="block truncate text-[11px] text-[color:var(--muted)]">
                                      {t.artist}
                                    </span>
                                  </button>
                                  {on && (
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                                      ✓
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {addSubtitles && (
                  <div className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)]">
                    <button
                      type="button"
                      disabled={creating}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      onClick={() => setSubsOpen((v) => !v)}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          Subtitle style
                        </span>
                        <span className="block truncate text-sm">
                          {SUBTITLE_STYLES.find((s) => s.id === subtitleStyle)
                            ?.label || "Classic"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">
                        {subsOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {subsOpen && (
                      <div className="border-t border-[color:var(--line)] p-3">
                        <div className="grid grid-cols-4 gap-2">
                          {SUBTITLE_STYLES.map((s) => (
                            <SubtitleStyleCard
                              key={s.id}
                              style={s}
                              active={subtitleStyle === s.id}
                              disabled={creating}
                              onSelect={() => setSubtitleStyle(s.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Instructions{" "}
                  <span className="font-normal normal-case tracking-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  className="field min-h-[88px] w-full resize-y text-sm"
                  placeholder="e.g. keep the funny ending…"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={creating}
                  maxLength={800}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={creating || sources.length === 0}
                onClick={() => void startClip()}
              >
                {creating ? "Uploading…" : "Create short clip"}
              </button>
            </div>

            {/* Videos — above settings on mobile */}
            <div className="order-1 flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] sm:order-2 lg:sticky lg:top-4 lg:max-h-[min(720px,calc(100vh-7rem))]">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
                <p className="text-sm font-semibold">Videos</p>
                {sources.length > 0 && sources.length < MAX_SOURCES && (
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => fileRef.current?.click()}
                    className="flex h-9 w-9 items-center justify-center rounded-full border text-lg font-light transition"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--accent)",
                    }}
                    aria-label="Add video from device"
                  >
                    +
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {sources.length === 0 ? (
                  <div className="flex min-h-[160px] flex-col items-center justify-center sm:min-h-[280px]">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition hover:border-[color:rgba(232,165,75,0.45)] sm:py-16"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <span
                        className="text-2xl text-[color:var(--accent)]"
                        aria-hidden
                      >
                        +
                      </span>
                      <span className="text-sm font-semibold">
                        Add video from device
                      </span>
                      <span className="text-xs text-[color:var(--muted)]">
                        MP4 / MOV / WebM · max {MAX_MB} MB
                      </span>
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {sources.map((s, idx) => {
                      const watchUrl =
                        s.kind === "device"
                          ? s.previewUrl
                          : s.downloadUrl || s.previewUrl;
                      return (
                      <li
                        key={s.id}
                        className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/20"
                      >
                        <div
                          className="relative aspect-video cursor-pointer bg-black/40"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (watchUrl) setWatchSource(s);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (watchUrl) setWatchSource(s);
                            }
                          }}
                        >
                          {s.kind === "device" && s.previewUrl ? (
                            <video
                              src={s.previewUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : s.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.previewUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">
                              Video {idx + 1}
                            </div>
                          )}
                          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            {s.kind === "device" ? "Device" : "Media"}
                          </span>
                          {watchUrl && (
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
                              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white">
                                ▶
                              </span>
                            </span>
                          )}
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-sm text-white hover:bg-black/80"
                            aria-label="Remove"
                            disabled={creating}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSource(s.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="px-3 py-2">
                          <p className="truncate text-sm font-semibold">
                            {s.title}
                          </p>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "clips" && (
        <section className="rise-delay space-y-3 sm:space-y-4">
          {jobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-10 text-center text-sm text-[color:var(--muted)]">
              No clips yet. Create one in the Create tab.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">
              {jobs.map((job) => {
                const ready = job.status === "ready" && job.preview_url;
                const busy = QUEUE_STATUSES.has(job.status);
                const failed = job.status === "failed";
                const pct = jobProgressPercent(job.status);
                const aspect = String(job.metadata?.aspect_ratio || "9:16");
                const previewAspect =
                  aspect === "16:9"
                    ? "aspect-video"
                    : aspect === "1:1"
                      ? "aspect-square"
                      : "aspect-[9/16]";
                return (
                  <li
                    key={job.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] sm:rounded-2xl"
                  >
                    <div className={`relative w-full bg-black/50 ${previewAspect}`}>
                      {ready ? (
                        <video
                          src={`/api/jobs/${job.id}/preview`}
                          controls
                          playsInline
                          className="h-full w-full object-cover"
                          preload="metadata"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2.5 text-center sm:gap-2 sm:px-4">
                          <p
                            className="text-[11px] font-semibold sm:text-sm"
                            style={{
                              color: failed
                                ? "var(--danger)"
                                : statusColor(job.status),
                            }}
                          >
                            {clipStatusLabel(job.status)}
                          </p>
                          {busy && (
                            <>
                              <p className="text-lg font-bold tabular-nums text-[color:var(--fg)] sm:text-2xl">
                                {pct}%
                              </p>
                              <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/10 sm:h-1.5 sm:w-2/3">
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
                            <p className="line-clamp-3 text-[10px] text-[color:var(--muted)] sm:text-xs">
                              {job.error_message}
                            </p>
                          )}
                        </div>
                      )}
                      {ready && (
                        <a
                          href={`/dashboard/editor/${job.id}`}
                          className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80 sm:left-2 sm:top-2 sm:h-8 sm:w-8"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <svg
                            width="13"
                            height="13"
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
                            ...(ready
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
                    <div className="min-w-0 space-y-0.5 border-t border-[color:var(--line)] px-2 py-1.5 sm:space-y-1 sm:px-3.5 sm:py-3">
                      <p className="truncate text-xs font-semibold sm:text-sm">
                        {job.title || "AI Clip"}
                      </p>
                      <p className="truncate text-[10px] text-[color:var(--muted)] sm:text-xs">
                        {job.duration_seconds ? `${job.duration_seconds}s` : "—"}
                        {" · "}
                        {aspect}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {watchSource && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-label={watchSource.title}
          onClick={() => setWatchSource(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[color:var(--line)] bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <p className="truncate text-sm font-semibold">
                {watchSource.title}
              </p>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
                aria-label="Close"
                onClick={() => setWatchSource(null)}
              >
                ×
              </button>
            </div>
            <video
              key={watchSource.id}
              src={
                watchSource.kind === "device"
                  ? watchSource.previewUrl || undefined
                  : watchSource.downloadUrl ||
                    watchSource.previewUrl ||
                    undefined
              }
              className="aspect-video w-full bg-black object-contain"
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      )}
    </div>
  );
}
