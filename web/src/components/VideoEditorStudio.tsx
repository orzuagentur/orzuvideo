"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoJob } from "@/lib/types";
import { useToast } from "@/components/ToastNotice";

const EFFECTS = [
  { id: "none", label: "None", css: "none" },
  { id: "cinematic", label: "Cinematic", css: "contrast(1.08) saturate(1.12) brightness(1.02)" },
  { id: "vivid", label: "Vivid", css: "contrast(1.14) saturate(1.28) brightness(1.03)" },
  { id: "soft", label: "Soft", css: "contrast(0.96) saturate(0.92) brightness(1.04)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.2)" },
  { id: "punch", label: "Punch", css: "contrast(1.18) saturate(1.22) brightness(1.05)" },
  { id: "vignette", label: "Vignette", css: "contrast(1.06) saturate(1.08)" },
] as const;

const MOTIONS = [
  { id: "none", label: "None" },
  { id: "slow_push", label: "Slow push" },
  { id: "punch_in", label: "Punch in" },
  { id: "rise", label: "Rise" },
  { id: "drift_left", label: "Drift left" },
  { id: "drift_right", label: "Drift right" },
  { id: "snap_zoom", label: "Snap zoom" },
] as const;

const FADES = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "fadeblack", label: "Fade black" },
  { id: "fadewhite", label: "Fade white" },
] as const;

type Panel = "effects" | "motion" | "fades" | "music" | "audio";

type MusicTrack = {
  id: string;
  title: string;
  author: string;
  previewUrl: string | null;
};

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function parentReturnPath(job: VideoJob): string {
  const meta = job.metadata || {};
  const src = String(meta.source || "").toLowerCase();
  const pipe = String(meta.pipeline || "").toLowerCase();
  const lib = String(meta.library || "").toLowerCase();
  if (
    src === "ai_clipping" ||
    pipe === "ai_clipping" ||
    src === "clipping" ||
    lib === "clipping"
  ) {
    return "/dashboard/clipping";
  }
  return "/dashboard/content";
}

export function VideoEditorStudio({ job }: { job: VideoJob }) {
  const router = useRouter();
  const { show: toast, notice } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  const [panel, setPanel] = useState<Panel>("effects");
  const [effect, setEffect] = useState<(typeof EFFECTS)[number]["id"]>("cinematic");
  const [motion, setMotion] = useState<(typeof MOTIONS)[number]["id"]>("none");
  const [introFade, setIntroFade] = useState<(typeof FADES)[number]["id"]>("fade");
  const [outroFade, setOutroFade] = useState<(typeof FADES)[number]["id"]>("fadeblack");
  const [musicMode, setMusicMode] = useState<"none" | "auto" | "track">("auto");
  const [musicTrackId, setMusicTrackId] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.45);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [duration, setDuration] = useState(
    Number(job.duration_seconds) > 0 ? Number(job.duration_seconds) : 30,
  );
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(
    Number(job.duration_seconds) > 0 ? Number(job.duration_seconds) : 30,
  );
  const [current, setCurrent] = useState(0);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const backHref = useMemo(() => parentReturnPath(job), [job]);
  const previewSrc = `/api/jobs/${job.id}/preview`;
  const effectCss =
    EFFECTS.find((e) => e.id === effect)?.css || "none";

  useEffect(() => {
    let cancelled = false;
    setMusicLoading(true);
    void (async () => {
      const res = await fetch(
        "/api/media/search?type=music&q=soundtrack&page=1",
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setMusicLoading(false);
      if (!res.ok) {
        setTracks([]);
        return;
      }
      setTracks(
        ((data.items || []) as Array<{
          id: string;
          title?: string;
          author?: string;
          previewUrl?: string | null;
        }>).map((t) => ({
          id: String(t.id),
          title: t.title || `Track #${t.id}`,
          author: t.author || "Jamendo",
          previewUrl: t.previewUrl || null,
        })),
      );
    })();
    return () => {
      cancelled = true;
      musicRef.current?.pause();
    };
  }, []);

  const onLoadedMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
      setTrimEnd((prev) => (prev <= 0 || prev > d ? d : prev));
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function tick() {
      setCurrent(v!.currentTime || 0);
    }
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, []);

  function toggleMusicPreview(track: MusicTrack) {
    if (!track.previewUrl) return;
    if (playingMusicId === track.id) {
      musicRef.current?.pause();
      setPlayingMusicId(null);
      return;
    }
    musicRef.current?.pause();
    const audio = new Audio(track.previewUrl);
    audio.volume = musicVolume;
    musicRef.current = audio;
    audio.onended = () => setPlayingMusicId(null);
    void audio.play().then(() => setPlayingMusicId(track.id));
  }

  async function onExport() {
    if (exporting) return;
    if (trimEnd - trimStart < 0.5) {
      toast("Trim range is too short", "error");
      return;
    }
    setExporting(true);
    musicRef.current?.pause();
    const res = await fetch("/api/jobs/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_job_id: job.id,
        effect,
        motion,
        intro_fade: introFade,
        outro_fade: outroFade,
        music_mode: musicMode,
        music_track_id: musicMode === "track" ? musicTrackId || null : null,
        music_volume: musicVolume,
        keep_original_audio: keepOriginal,
        trim_start: trimStart,
        trim_end: trimEnd,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setExporting(false);
    if (!res.ok) {
      toast(data.error || "Export failed", "error");
      return;
    }
    toast("Export started", "info");
    const dest =
      backHref === "/dashboard/clipping"
        ? "/dashboard/clipping"
        : "/dashboard/content";
    router.push(dest);
  }

  const panels: { id: Panel; label: string }[] = [
    { id: "effects", label: "Effects" },
    { id: "motion", label: "Motion" },
    { id: "fades", label: "Fades" },
    { id: "music", label: "Music" },
    { id: "audio", label: "Audio" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#0c0c0c] text-[color:var(--fg)]">
      {notice}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3 md:px-6">
        <Link
          href={backHref}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-[color:var(--muted)] transition hover:border-white/25 hover:text-[color:var(--fg)]"
        >
          Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-syne)] text-lg tracking-tight" style={{ fontWeight: 700 }}>
            Editor
          </p>
          <p className="truncate text-xs text-[color:var(--muted)]">
            {job.title || "Untitled"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary px-5 text-sm"
          disabled={exporting}
          onClick={() => void onExport()}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 md:p-6">
            <div className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-xl bg-black shadow-2xl">
              <video
                ref={videoRef}
                src={previewSrc}
                className="aspect-video max-h-[min(58vh,640px)] w-full object-contain"
                style={{
                  filter: effectCss === "none" ? undefined : effectCss,
                }}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={onLoadedMeta}
              />
              {effect === "vignette" && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  style={{
                    boxShadow: "inset 0 0 80px 28px rgba(0,0,0,0.55)",
                  }}
                />
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-white/10 px-4 py-4 md:px-6">
            <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
              <span>{formatTime(current)}</span>
              <span>
                Trim {formatTime(trimStart)} – {formatTime(trimEnd)}
              </span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="relative h-10">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
              <div
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{
                  left: `${duration > 0 ? (trimStart / duration) * 100 : 0}%`,
                  width: `${
                    duration > 0
                      ? ((trimEnd - trimStart) / duration) * 100
                      : 100
                  }%`,
                  background: "rgba(232,165,75,0.85)",
                }}
              />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.05}
                value={trimStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTrimStart(Math.min(v, trimEnd - 0.5));
                }}
                className="absolute inset-x-0 top-0 h-10 w-full cursor-pointer appearance-none bg-transparent"
                aria-label="Trim start"
              />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.05}
                value={trimEnd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTrimEnd(Math.max(v, trimStart + 0.5));
                }}
                className="absolute inset-x-0 top-0 h-10 w-full cursor-pointer appearance-none bg-transparent opacity-70"
                aria-label="Trim end"
              />
            </div>
          </div>
        </div>

        <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-t border-white/10 bg-[#121212] lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2">
            {panels.map((p) => {
              const on = panel === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPanel(p.id)}
                  className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition"
                  style={{
                    background: on ? "rgba(232,165,75,0.16)" : "transparent",
                    color: on ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {panel === "effects" && (
              <div className="grid grid-cols-2 gap-2">
                {EFFECTS.map((e) => {
                  const on = effect === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEffect(e.id)}
                      className="rounded-xl border px-3 py-3 text-left text-sm font-semibold transition"
                      style={{
                        borderColor: on
                          ? "rgba(232,165,75,0.55)"
                          : "rgba(255,255,255,0.1)",
                        background: on
                          ? "rgba(232,165,75,0.12)"
                          : "rgba(255,255,255,0.03)",
                        color: on ? "var(--accent)" : "var(--fg)",
                      }}
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            )}

            {panel === "motion" && (
              <div className="space-y-2">
                {MOTIONS.map((m) => {
                  const on = motion === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMotion(m.id)}
                      className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold"
                      style={{
                        borderColor: on
                          ? "rgba(232,165,75,0.55)"
                          : "rgba(255,255,255,0.1)",
                        background: on
                          ? "rgba(232,165,75,0.12)"
                          : "transparent",
                        color: on ? "var(--accent)" : "var(--fg)",
                      }}
                    >
                      {m.label}
                      {on && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {panel === "fades" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Intro
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FADES.map((f) => {
                      const on = introFade === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setIntroFade(f.id)}
                          className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                          style={{
                            borderColor: on
                              ? "rgba(232,165,75,0.55)"
                              : "rgba(255,255,255,0.12)",
                            color: on ? "var(--accent)" : "var(--fg)",
                            background: on
                              ? "rgba(232,165,75,0.12)"
                              : "transparent",
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Outro
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FADES.map((f) => {
                      const on = outroFade === f.id;
                      return (
                        <button
                          key={`out-${f.id}`}
                          type="button"
                          onClick={() => setOutroFade(f.id)}
                          className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                          style={{
                            borderColor: on
                              ? "rgba(232,165,75,0.55)"
                              : "rgba(255,255,255,0.12)",
                            color: on ? "var(--accent)" : "var(--fg)",
                            background: on
                              ? "rgba(232,165,75,0.12)"
                              : "transparent",
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {panel === "music" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "none" as const, label: "None" },
                      { id: "auto" as const, label: "Auto" },
                      { id: "track" as const, label: "Pick" },
                    ] as const
                  ).map((m) => {
                    const on = musicMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMusicMode(m.id)}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: on
                            ? "rgba(232,165,75,0.55)"
                            : "rgba(255,255,255,0.12)",
                          color: on ? "var(--accent)" : "var(--fg)",
                          background: on
                            ? "rgba(232,165,75,0.12)"
                            : "transparent",
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                {musicMode !== "none" && (
                  <label className="block space-y-1 text-xs text-[color:var(--muted)]">
                    Volume
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={musicVolume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMusicVolume(v);
                        if (musicRef.current) musicRef.current.volume = v;
                      }}
                      className="w-full"
                    />
                  </label>
                )}
                {musicMode === "track" && (
                  <div className="max-h-[280px] space-y-1.5 overflow-y-auto">
                    {musicLoading ? (
                      <p className="text-xs text-[color:var(--muted)]">
                        Loading…
                      </p>
                    ) : (
                      tracks.map((t) => {
                        const on = musicTrackId === t.id;
                        const playing = playingMusicId === t.id;
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                            style={{
                              background: on
                                ? "rgba(232,165,75,0.12)"
                                : "transparent",
                              border: `1px solid ${
                                on ? "rgba(232,165,75,0.45)" : "transparent"
                              }`,
                            }}
                          >
                            <button
                              type="button"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm"
                              disabled={!t.previewUrl}
                              onClick={() => toggleMusicPreview(t)}
                            >
                              {playing ? "■" : "▶"}
                            </button>
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => setMusicTrackId(t.id)}
                            >
                              <span className="block truncate text-sm font-medium">
                                {t.title}
                              </span>
                              <span className="block truncate text-[11px] text-[color:var(--muted)]">
                                {t.author}
                              </span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {panel === "audio" && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setKeepOriginal(true)}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-semibold"
                  style={{
                    borderColor: keepOriginal
                      ? "rgba(232,165,75,0.55)"
                      : "rgba(255,255,255,0.1)",
                    background: keepOriginal
                      ? "rgba(232,165,75,0.12)"
                      : "transparent",
                  }}
                >
                  Keep original audio
                  {keepOriginal && <span>✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setKeepOriginal(false)}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-semibold"
                  style={{
                    borderColor: !keepOriginal
                      ? "rgba(232,165,75,0.55)"
                      : "rgba(255,255,255,0.1)",
                    background: !keepOriginal
                      ? "rgba(232,165,75,0.12)"
                      : "transparent",
                  }}
                >
                  Mute original (music only)
                  {!keepOriginal && <span>✓</span>}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
