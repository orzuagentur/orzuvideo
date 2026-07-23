"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
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
type SubtitleStyleId = (typeof SUBTITLE_STYLES)[number]["id"];

/** Full sentence for live karaoke-style preview on each subtitle card */
const PREVIEW_SENTENCE =
  "This is how your subtitles look on the clip";
const PREVIEW_WORDS = PREVIEW_SENTENCE.split(/\s+/);
/** Match burned ASS: ~3 words on screen, then advance to the next group */
const PREVIEW_CHUNK = 3;

/** One square stock photo per style (Unsplash — free to display) */
const SUBTITLE_PREVIEW_BG: Record<SubtitleStyleId, string> = {
  classic:
    "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=480&h=480&q=80",
  karaoke_gold:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=480&h=480&q=80",
  box_white:
    "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=480&h=480&q=80",
  neon_pink:
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=480&h=480&q=80",
  minimal:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=480&h=480&q=80",
  impact:
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=480&h=480&q=80",
  soft_shadow:
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=480&h=480&q=80",
  yellow_pop:
    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=480&h=480&q=80",
  lower_third:
    "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=480&h=480&q=80",
  hook_banner:
    "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=480&h=480&q=80",
};

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
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{detail}</span>
      </span>
    </button>
  );
}

function liveSubtitleStyle(style: SubtitleStyleId): CSSProperties {
  const base: CSSProperties = {
    fontWeight: 800,
    fontSize: "0.68rem",
    lineHeight: 1.35,
    textAlign: "center",
    maxWidth: "100%",
  };
  switch (style) {
    case "karaoke_gold":
      return {
        ...base,
        color: "#FFD700",
        textShadow: "0 0 10px rgba(255,215,0,0.55), 0 2px 4px #000",
      };
    case "box_white":
      return {
        ...base,
        color: "#fff",
        background: "rgba(0,0,0,0.62)",
        borderRadius: 6,
        padding: "4px 8px",
        display: "inline-block",
      };
    case "neon_pink":
      return {
        ...base,
        color: "#FF66FF",
        textShadow: "0 0 10px #FF00AA, 0 2px 4px #000",
      };
    case "minimal":
      return {
        ...base,
        color: "#f0f0f0",
        fontWeight: 500,
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
      };
    case "impact":
      return {
        ...base,
        fontSize: "0.72rem",
        color: "#fff",
        textShadow: "2px 2px 0 #000, -1px -1px 0 #000",
      };
    case "soft_shadow":
      return {
        ...base,
        color: "#fff",
        textShadow: "0 3px 8px rgba(0,0,0,0.9)",
      };
    case "yellow_pop":
      return {
        ...base,
        color: "#FFFF00",
        textShadow: "0 2px 4px #000",
      };
    case "lower_third":
      return {
        ...base,
        color: "#fff",
        fontSize: "0.62rem",
        background: "rgba(0,0,0,0.75)",
        borderLeft: "3px solid var(--accent)",
        padding: "4px 8px",
        display: "inline-block",
        textAlign: "left",
      };
    case "hook_banner":
      return {
        ...base,
        color: "var(--accent)",
        fontSize: "0.72rem",
        textShadow: "0 2px 6px #000",
      };
    default:
      return {
        ...base,
        color: "#fff",
        textShadow: "0 2px 4px #000, 0 0 1px #000",
      };
  }
}

function SubtitleStyleCard({
  style,
  active,
  disabled,
  onSelect,
}: {
  style: (typeof SUBTITLE_STYLES)[number];
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const cursorRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const advance = () => {
      if (cancelled) return;
      const c = cursorRef.current;
      const next = (c + 1) % PREVIEW_WORDS.length;
      const curChunk = Math.floor(c / PREVIEW_CHUNK);
      const nextChunk = Math.floor(next / PREVIEW_CHUNK);
      const wraps = nextChunk !== curChunk || next === 0;

      if (wraps) {
        setLeaving(true);
        later(() => {
          if (cancelled) return;
          cursorRef.current = next;
          setCursor(next);
          setLeaving(false);
          later(advance, 500);
        }, 170);
        return;
      }

      cursorRef.current = next;
      setCursor(next);
      later(advance, 500);
    };

    later(advance, 500);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const css = liveSubtitleStyle(style.id);
  const bg = SUBTITLE_PREVIEW_BG[style.id];
  const chunkStart = Math.floor(cursor / PREVIEW_CHUNK) * PREVIEW_CHUNK;
  const chunk = PREVIEW_WORDS.slice(chunkStart, chunkStart + PREVIEW_CHUNK);
  const activeInChunk = cursor - chunkStart;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-xl border text-left transition"
      style={{
        borderColor: active ? "rgba(232,165,75,0.55)" : "var(--line)",
        background: active ? "rgba(232,165,75,0.1)" : "rgba(0,0,0,0.25)",
        boxShadow: active ? "0 0 0 1px rgba(232,165,75,0.25)" : undefined,
      }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex min-h-[42%] items-end justify-center px-2.5 pb-3 pt-6">
          <span
            style={{
              ...css,
              display: "inline-block",
              opacity: leaving ? 0 : 1,
              transform: leaving ? "translateY(8px)" : "translateY(0)",
              transition: "opacity 0.16s ease, transform 0.16s ease",
            }}
          >
            {chunk.map((w, i) => {
              const isLive = i === activeInChunk && !leaving;
              const isPast = i < activeInChunk;
              return (
                <span
                  key={`${chunkStart}-${w}-${i}`}
                  style={{
                    opacity: isLive ? 1 : isPast ? 0.9 : 0.38,
                    transform: isLive
                      ? "translateY(-1px) scale(1.1)"
                      : "translateY(0) scale(1)",
                    display: "inline-block",
                    marginRight: i < chunk.length - 1 ? "0.3em" : 0,
                    transition:
                      "opacity 0.28s ease, transform 0.28s ease, filter 0.28s ease",
                    filter: isLive ? "brightness(1.2)" : "none",
                  }}
                >
                  {w}
                </span>
              );
            })}
          </span>
        </div>
      </div>
      <span className="truncate px-2 py-1.5 text-[11px] font-semibold">
        {style.label}
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
  const [subsOpen, setSubsOpen] = useState(true);
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

      <header className="rise">
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

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* Left — settings */}
            <div className="space-y-5 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Format
                </p>
                <p className="mb-2 text-[11px] text-[color:var(--muted)]">
                  Output is locked to the format you pick.
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
                          borderColor: on
                            ? "rgba(232,165,75,0.55)"
                            : "var(--line)",
                          background: on
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                        }}
                      >
                        <span
                          className="block text-sm font-bold"
                          style={{ color: on ? "var(--accent)" : "var(--fg)" }}
                        >
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
                <p className="mb-2 text-[11px] text-[color:var(--muted)]">
                  Clip is cut to this duration — not longer.
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

              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  on={useVoice}
                  disabled={creating}
                  label="Voice"
                  detail="ElevenLabs narration"
                  onChange={setUseVoice}
                />
                <Toggle
                  on={addMusic}
                  disabled={creating}
                  label="Music"
                  detail="Background track"
                  onChange={setAddMusic}
                />
                <Toggle
                  on={addSubtitles}
                  disabled={creating}
                  label="Subtitles"
                  detail="Burn karaoke captions"
                  onChange={setAddSubtitles}
                />
              </div>

              {useVoice && (
                <div className="rounded-xl border border-[color:var(--line)]">
                  <button
                    type="button"
                    disabled={creating}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    onClick={() => setVoiceOpen((v) => !v)}
                  >
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        Voice
                      </span>
                      <span className="text-sm">
                        {voiceId ? "Custom voice" : "Auto — AI picks"}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {voiceOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {voiceOpen && (
                    <div className="border-t border-[color:var(--line)] p-3">
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
                <div className="rounded-xl border border-[color:var(--line)]">
                  <button
                    type="button"
                    disabled={creating}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    onClick={() => setMusicOpen((v) => !v)}
                  >
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        Music
                      </span>
                      <span className="text-sm">
                        {musicTrackId
                          ? musicTracks.find((t) => t.id === musicTrackId)
                              ?.name || "Selected track"
                          : "Auto"}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {musicOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {musicOpen && (
                    <div className="space-y-2 border-t border-[color:var(--line)] p-3">
                      {musicLoading ? (
                        <p className="text-xs text-[color:var(--muted)]">
                          Loading tracks…
                        </p>
                      ) : musicTracks.length === 0 ? (
                        <p className="text-xs text-[color:var(--muted)]">
                          No tracks available yet.
                        </p>
                      ) : (
                        <div className="max-h-[280px] space-y-1.5 overflow-y-auto">
                          <button
                            type="button"
                            disabled={creating}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition"
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
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                Auto
                              </span>
                              <span className="block text-[11px] text-[color:var(--muted)]">
                                AI picks a track
                              </span>
                            </span>
                            {!musicTrackId && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
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
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
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
                                  className="min-w-0 flex-1 text-left"
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
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
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
                <div className="rounded-xl border border-[color:var(--line)]">
                  <button
                    type="button"
                    disabled={creating}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    onClick={() => setSubsOpen((v) => !v)}
                  >
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        Subtitle style
                      </span>
                      <span className="text-sm">
                        {SUBTITLE_STYLES.find((s) => s.id === subtitleStyle)
                          ?.label || "Classic"}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {subsOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {subsOpen && (
                    <div className="border-t border-[color:var(--line)] p-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

            {/* Right — videos card (scrolls inside) */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] lg:sticky lg:top-4 lg:max-h-[min(720px,calc(100vh-7rem))]">
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
                  <div className="flex min-h-[280px] flex-col items-center justify-center">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center transition hover:border-[color:rgba(232,165,75,0.45)]"
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
        <section className="rise-delay space-y-4">
          {jobs.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">
              No clips yet. Create one in the Create tab.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {jobs.map((job) => {
                const ready = job.status === "ready" && job.preview_url;
                const busy = QUEUE_STATUSES.has(job.status);
                const failed = job.status === "failed";
                const pct = jobProgressPercent(job.status);
                return (
                  <li
                    key={job.id}
                    className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]"
                  >
                    <div className="relative aspect-video bg-black/50">
                      {ready ? (
                        <video
                          src={`/api/jobs/${job.id}/preview`}
                          controls
                          className="h-full w-full object-contain"
                          preload="metadata"
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
                            {clipStatusLabel(job.status)}
                          </p>
                          {busy && (
                            <>
                              <p className="text-2xl font-bold tabular-nums text-[color:var(--fg)]">
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
                      {ready && (
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
                    <div className="space-y-1 border-t border-[color:var(--line)] px-3.5 py-3">
                      <p className="truncate text-sm font-semibold">
                        {job.title || "AI Clip"}
                      </p>
                      <p className="text-xs text-[color:var(--muted)]">
                        {job.duration_seconds ? `${job.duration_seconds}s` : "—"}
                        {" · "}
                        {String(job.metadata?.aspect_ratio || "9:16")}
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
