"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import { PREVIEW_BUCKET } from "@/lib/storage";
import { VoicePicker } from "@/components/VoicePicker";

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
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB â€” matches storage bucket for clipping sources
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

type LibraryItem = {
  id: string;
  title: string;
  author: string;
  kind: string;
  provider: string;
  media_url: string | null;
  thumb_url: string | null;
  download_url: string | null;
  duration_seconds: number | null;
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
        {on ? "âœ“" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{detail}</span>
      </span>
    </button>
  );
}

function AddSourceMenu({
  onDevice,
  onMedia,
}: {
  onDevice: () => void;
  onMedia: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition hover:bg-white/5"
        onClick={onDevice}
      >
        <span className="text-sm font-semibold">From device</span>
        <span className="text-xs text-[color:var(--muted)]">
          Upload MP4 / MOV (max {MAX_MB} MB)
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full flex-col items-start gap-0.5 border-t border-[color:var(--line)] px-4 py-3 text-left transition hover:bg-white/5"
        onClick={onMedia}
      >
        <span className="text-sm font-semibold">Media library</span>
        <span className="text-xs text-[color:var(--muted)]">
          Pexels videos from Media (our API)
        </span>
      </button>
    </div>
  );
}

function LibraryModal({
  open,
  alreadyIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  alreadyIds: Set<string>;
  onClose: () => void;
  onConfirm: (items: LibraryItem[]) => void;
}) {
  const [q, setQ] = useState("cinematic");
  const [orientation, setOrientation] = useState("all");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQ("cinematic");
    setOrientation("all");
    setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        const params = new URLSearchParams({
          q: q.trim() || "cinematic",
          page: String(page),
          orientation,
        });
        const res = await fetch(`/api/clipping/library?${params}`);
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        if (res.ok) {
          setItems((data.items || []) as LibraryItem[]);
          setHasMore(Boolean(data.hasMore));
        } else {
          setItems([]);
          setHasMore(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, q, orientation, page]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const picked = items.filter((i) => selected.has(i.id));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label="Media library"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Media library</h2>
            <p className="text-xs text-[color:var(--muted)]">
              Same Pexels videos as Media â€” loaded via our API
            </p>
          </div>
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-5 py-3">
          <input
            className="field min-w-[12rem] flex-1 text-sm"
            placeholder="Search Media videosâ€¦"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            autoFocus
          />
          {(
            [
              ["all", "All"],
              ["portrait", "Portrait"],
              ["landscape", "Landscape"],
              ["square", "Square"],
            ] as const
          ).map(([id, label]) => {
            const on = orientation === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPage(1);
                  setOrientation(id);
                }}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                  background: on ? "rgba(232,165,75,0.14)" : "transparent",
                  color: on ? "var(--accent)" : "var(--fg)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-[color:var(--muted)]">
              Loading Mediaâ€¦
            </p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-[color:var(--muted)]">
              No videos found
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const on = selected.has(item.id);
                const locked = alreadyIds.has(item.id) && !on;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                      className="w-full overflow-hidden rounded-xl border text-left transition"
                      style={{
                        borderColor: on ? "rgba(232,165,75,0.6)" : "var(--line)",
                        opacity: locked ? 0.45 : 1,
                        boxShadow: on
                          ? "0 0 0 1px rgba(232,165,75,0.35)"
                          : undefined,
                      }}
                    >
                      <div className="relative aspect-video bg-black/40">
                        {item.thumb_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumb_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : item.media_url ? (
                          <video
                            src={item.media_url}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : null}
                        <span
                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                          style={{
                            background: on ? "var(--accent)" : "rgba(0,0,0,0.55)",
                            color: on ? "#1a1208" : "#fff",
                          }}
                        >
                          {on ? "âœ“" : ""}
                        </span>
                      </div>
                      <div className="space-y-0.5 px-2.5 py-2">
                        <p className="line-clamp-2 text-xs font-semibold leading-snug">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-[color:var(--muted)]">
                          {item.author || "Pexels"}
                          {item.duration_seconds
                            ? ` Â· ${item.duration_seconds}s`
                            : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--line)] px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-xs text-[color:var(--muted)]">Page {page}</span>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={!hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-[color:var(--muted)]">{picked.length} selected</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={picked.length === 0}
              onClick={() => onConfirm(picked)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AIClippingStudio({ initialJobs }: { initialJobs: VideoJob[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [jobs, setJobs] = useState(() => initialJobs.filter(isClippingJob));
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [addMenu, setAddMenu] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [duration, setDuration] = useState(30);
  const [useVoice, setUseVoice] = useState(true);
  const [voiceId, setVoiceId] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [addMusic, setAddMusic] = useState(true);
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
  const [tab, setTab] = useState<"create" | "clips">("create");
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
      const params = new URLSearchParams({
        type: "music",
        q: "soundtrack",
        page: "1",
      });
      const res = await fetch(`/api/media/search?${params}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setMusicLoading(false);
      if (!res.ok) {
        setMusicTracks([]);
        return;
      }
      const tracks = (
        (data.items || []) as Array<{
          id: string;
          title?: string;
          author?: string;
          previewUrl?: string | null;
        }>
      ).map((t) => ({
        id: String(t.id),
        name: t.title || `Track #${t.id}`,
        artist: t.author || "Jamendo",
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
    if (!addMenu) return;
    function onDoc(e: MouseEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenu(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenu]);

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

  function addLibraryItems(items: LibraryItem[]) {
    const room = MAX_SOURCES - sources.length;
    const existing = new Set(
      sources.filter((s) => s.mediaId).map((s) => s.mediaId!),
    );
    const next: ClipSource[] = [];
    for (const item of items) {
      if (existing.has(item.id)) continue;
      if (next.length >= room) break;
      if (!item.download_url) continue;
      next.push({
        id: uid(),
        kind: "media",
        title: item.title,
        previewUrl: item.thumb_url || item.media_url,
        mediaId: item.id,
        provider: item.provider || "pexels",
        downloadUrl: item.download_url || item.media_url,
      });
    }
    if (next.length === 0) {
      toast("Those videos are already added or unavailable", "info");
    } else {
      setSources((prev) => [...prev, ...next]);
    }
    setLibraryOpen(false);
  }

  async function startClip() {
    if (sources.length === 0) {
      toast("Add at least one video first.", "error");
      return;
    }
    setCreating(true);
    setAddMenu(false);

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
          const path = `${user.id}/clipping/${jobId}/source_${i}.mp4`;
          const { error: upErr } = await supabase.storage
            .from(PREVIEW_BUCKET)
            .upload(path, s.file, {
              contentType: s.file.type || "video/mp4",
              upsert: true,
            });
          if (upErr) throw new Error(upErr.message || "Upload failed");
          const { data: pub } = supabase.storage
            .from(PREVIEW_BUCKET)
            .getPublicUrl(path);
          payloadSources.push({
            kind: "device",
            title: s.title,
            storage_path: path,
            storage_bucket: PREVIEW_BUCKET,
            url: pub.publicUrl,
          });
        } else if (s.kind === "media") {
          payloadSources.push({
            kind: "media",
            title: s.title,
            media_id: s.mediaId,
            provider: s.provider || "pexels",
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
      setTab("clips");
      toast("Clip queued â€” see My clips.", "info");
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

  const alreadyLibraryIds = useMemo(() => {
    const s = new Set<string>();
    sources.forEach((x) => {
      if (x.mediaId) s.add(x.mediaId);
    });
    return s;
  }, [sources]);

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 pb-24">
      {notice}
      <LibraryModal
        open={libraryOpen}
        alreadyIds={alreadyLibraryIds}
        onClose={() => setLibraryOpen(false)}
        onConfirm={addLibraryItems}
      />

      <header className="rise space-y-4">
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          AI Clipping
        </h1>
        <nav
          className="flex gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1"
          aria-label="AI Clipping sections"
        >
          {(
            [
              { id: "create" as const, label: "Create" },
              { id: "clips" as const, label: "My clips" },
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
                          : "Auto — AI picks"}
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
            <div
              className="flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] lg:sticky lg:top-4 lg:max-h-[min(720px,calc(100vh-7rem))]"
              ref={addMenuRef}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Videos</p>
                  <p className="text-[11px] text-[color:var(--muted)]">
                    {sources.length}/{MAX_SOURCES}
                  </p>
                </div>
                {sources.length > 0 && sources.length < MAX_SOURCES && (
                  <div className="relative">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => setAddMenu((v) => !v)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border text-lg font-light transition"
                      style={{
                        borderColor: addMenu
                          ? "rgba(232,165,75,0.55)"
                          : "var(--line)",
                        color: "var(--accent)",
                      }}
                      aria-label="Add video"
                    >
                      +
                    </button>
                    {addMenu && (
                      <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[220px]">
                        <AddSourceMenu
                          onDevice={() => {
                            setAddMenu(false);
                            fileRef.current?.click();
                          }}
                          onMedia={() => {
                            setAddMenu(false);
                            setLibraryOpen(true);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {sources.length === 0 ? (
                  <div className="relative flex min-h-[280px] flex-col items-center justify-center">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => setAddMenu((v) => !v)}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center transition hover:border-[color:rgba(232,165,75,0.45)]"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <span
                        className="text-2xl text-[color:var(--accent)]"
                        aria-hidden
                      >
                        +
                      </span>
                      <span className="text-sm font-semibold">Add video</span>
                    </button>
                    {addMenu && (
                      <div className="absolute left-1/2 top-1/2 z-20 w-[min(100%-1.5rem,260px)] -translate-x-1/2 -translate-y-1/2">
                        <AddSourceMenu
                          onDevice={() => {
                            setAddMenu(false);
                            fileRef.current?.click();
                          }}
                          onMedia={() => {
                            setAddMenu(false);
                            setLibraryOpen(true);
                          }}
                        />
                      </div>
                    )}
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
