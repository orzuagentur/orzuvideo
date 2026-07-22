"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { VideoJob } from "@/lib/types";
import { useToast } from "@/components/ToastNotice";
import {
  EFFECTS,
  FADES,
  MOTIONS,
  SUBTITLE_STYLES,
  TEXT_STYLES,
  TRANSITIONS,
} from "@/lib/editor-catalog";

type Category =
  | "trim"
  | "filters"
  | "motion"
  | "inout"
  | "transition"
  | "text"
  | "captions"
  | "music"
  | "sound";

type MusicTrack = {
  id: string;
  title: string;
  author: string;
  previewUrl: string | null;
};

const ACCENT = "#E8A54B";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "trim", label: "Trim" },
  { id: "filters", label: "Filters" },
  { id: "motion", label: "Motion" },
  { id: "inout", label: "In/Out" },
  { id: "transition", label: "Transition" },
  { id: "text", label: "Text" },
  { id: "captions", label: "Captions" },
  { id: "music", label: "Music" },
  { id: "sound", label: "Sound" },
];

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

function overlayTextClass(style: (typeof TEXT_STYLES)[number]["id"]) {
  switch (style) {
    case "hook_top":
      return "absolute inset-x-3 top-[14%] text-center";
    case "caption_bottom":
      return "absolute inset-x-3 bottom-[22%] text-center";
    case "box_lower":
      return "absolute inset-x-3 bottom-[18%] text-center";
    case "tiny_credit":
      return "absolute inset-x-3 bottom-[6%] text-center";
    case "mega_title":
      return "absolute inset-x-2 top-1/2 -translate-y-1/2 text-center";
    default:
      return "absolute inset-x-3 top-1/2 -translate-y-1/2 text-center";
  }
}

function overlayTextStyle(style: (typeof TEXT_STYLES)[number]["id"]): CSSProperties {
  const base: CSSProperties = {
    fontWeight: 800,
    textShadow: "0 2px 8px rgba(0,0,0,0.85)",
  };
  switch (style) {
    case "hook_top":
      return { ...base, color: ACCENT, fontSize: "1rem" };
    case "caption_bottom":
      return { ...base, color: "#fff", fontSize: "0.85rem" };
    case "box_lower":
      return {
        ...base,
        color: "#fff",
        fontSize: "0.8rem",
        background: "rgba(0,0,0,0.55)",
        borderRadius: 8,
        padding: "6px 10px",
        display: "inline-block",
      };
    case "tiny_credit":
      return { ...base, color: "rgba(255,255,255,0.75)", fontSize: "0.65rem", fontWeight: 600 };
    case "mega_title":
      return { ...base, color: "#fff", fontSize: "1.35rem", letterSpacing: "-0.02em" };
    default:
      return { ...base, color: "#fff", fontSize: "1.05rem" };
  }
}

function captionPreviewStyle(
  style: (typeof SUBTITLE_STYLES)[number]["id"],
): CSSProperties {
  const base: CSSProperties = {
    fontWeight: 800,
    fontSize: "0.82rem",
    lineHeight: 1.25,
    textAlign: "center",
  };
  switch (style) {
    case "karaoke_gold":
      return { ...base, color: "#FFD700", textShadow: "0 0 12px rgba(255,215,0,0.5), 0 2px 4px #000" };
    case "box_white":
      return {
        ...base,
        color: "#fff",
        background: "rgba(0,0,0,0.6)",
        borderRadius: 6,
        padding: "4px 10px",
        display: "inline-block",
      };
    case "neon_pink":
      return { ...base, color: "#FF66FF", textShadow: "0 0 10px #FF00AA, 0 2px 4px #000" };
    case "minimal":
      return { ...base, color: "#f0f0f0", fontWeight: 500, textShadow: "0 1px 3px rgba(0,0,0,0.6)" };
    case "impact":
      return { ...base, fontSize: "0.95rem", color: "#fff", textShadow: "2px 2px 0 #000, -1px -1px 0 #000" };
    case "soft_shadow":
      return { ...base, color: "#fff", textShadow: "0 3px 8px rgba(0,0,0,0.9)" };
    case "yellow_pop":
      return { ...base, color: "#FFFF00", textShadow: "0 2px 4px #000" };
    case "lower_third":
      return {
        ...base,
        color: "#fff",
        fontSize: "0.72rem",
        background: "rgba(0,0,0,0.75)",
        borderLeft: `3px solid ${ACCENT}`,
        padding: "4px 8px",
        display: "inline-block",
        textAlign: "left" as const,
      };
    case "hook_banner":
      return { ...base, color: ACCENT, fontSize: "0.95rem", textShadow: "0 2px 6px #000" };
    default:
      return { ...base, color: "#fff", textShadow: "0 2px 4px #000, 0 0 1px #000" };
  }
}

function Chip({
  label,
  active,
  onClick,
  swatch,
  swatchFilter,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  swatch?: string;
  swatchFilter?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1.5"
      style={{ width: 64 }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl text-[10px] font-bold transition"
        style={{
          border: active ? `2px solid ${ACCENT}` : "2px solid rgba(255,255,255,0.12)",
          background: swatch || (active ? "rgba(232,165,75,0.18)" : "#1a1a1a"),
          color: active ? ACCENT : "rgba(255,255,255,0.85)",
          boxShadow: active ? `0 0 0 1px rgba(232,165,75,0.25)` : undefined,
        }}
      >
        {swatch ? (
          <span
            className="h-full w-full"
            style={{
              background: swatch,
              filter: swatchFilter && swatchFilter !== "none" ? swatchFilter : undefined,
            }}
          />
        ) : (
          label.slice(0, 2).toUpperCase()
        )}
      </span>
      <span
        className="max-w-[64px] truncate text-center text-[10px] font-medium leading-tight"
        style={{ color: active ? ACCENT : "rgba(255,255,255,0.55)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function VideoEditorStudio({ job }: { job: VideoJob }) {
  const router = useRouter();
  const { show: toast, notice } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  const [cat, setCat] = useState<Category>("filters");
  const [playing, setPlaying] = useState(false);
  const [effect, setEffect] = useState<(typeof EFFECTS)[number]["id"]>("cinematic");
  const [motion, setMotion] = useState<(typeof MOTIONS)[number]["id"]>("none");
  const [introFade, setIntroFade] = useState<(typeof FADES)[number]["id"]>("fade");
  const [outroFade, setOutroFade] = useState<(typeof FADES)[number]["id"]>("fadeblack");
  const [transition, setTransition] =
    useState<(typeof TRANSITIONS)[number]["id"]>("fade");
  const [textStyle, setTextStyle] =
    useState<(typeof TEXT_STYLES)[number]["id"]>("bold_center");
  const [subtitleStyle, setSubtitleStyle] =
    useState<(typeof SUBTITLE_STYLES)[number]["id"]>("classic");
  const [overlayText, setOverlayText] = useState("");
  const [captionText, setCaptionText] = useState("");
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
  const effectCss = EFFECTS.find((e) => e.id === effect)?.css || "none";

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
          author: t.author || "Library",
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
      const t = v!.currentTime || 0;
      setCurrent(t);
      if (t >= trimEnd - 0.05) {
        v!.pause();
        setPlaying(false);
        v!.currentTime = trimStart;
        setCurrent(trimStart);
      }
    }
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, [trimEnd, trimStart]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    if (v.currentTime < trimStart || v.currentTime >= trimEnd) {
      v.currentTime = trimStart;
    }
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function seekTo(ratio: number) {
    const v = videoRef.current;
    if (!v || duration <= 0) return;
    const t = Math.max(trimStart, Math.min(trimEnd, ratio * duration));
    v.currentTime = t;
    setCurrent(t);
  }

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
    videoRef.current?.pause();
    setPlaying(false);

    const res = await fetch("/api/jobs/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_job_id: job.id,
        effect,
        motion,
        intro_fade: introFade,
        outro_fade: outroFade,
        preferred_transition: transition,
        text_style: textStyle,
        subtitle_style: subtitleStyle,
        overlay_text: overlayText.trim() || null,
        caption_text: captionText.trim() || null,
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
    router.push(backHref);
  }

  function renderDockTools() {
    switch (cat) {
      case "trim":
        return (
          <div className="flex w-full min-w-0 flex-col gap-3 px-1">
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-white/50">
                <span>Start</span>
                <span>{formatTime(trimStart)}</span>
              </div>
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
                className="w-full accent-[#E8A54B]"
                aria-label="Trim start"
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-white/50">
                <span>End</span>
                <span>{formatTime(trimEnd)}</span>
              </div>
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
                className="w-full accent-[#E8A54B]"
                aria-label="Trim end"
              />
            </div>
          </div>
        );

      case "filters":
        return (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {EFFECTS.map((e) => (
              <Chip
                key={e.id}
                label={e.label}
                active={effect === e.id}
                onClick={() => setEffect(e.id)}
                swatch="linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)"
                swatchFilter={e.css}
              />
            ))}
          </div>
        );

      case "motion":
        return (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {MOTIONS.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                active={motion === m.id}
                onClick={() => setMotion(m.id)}
              />
            ))}
          </div>
        );

      case "inout":
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Intro
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {FADES.map((f) => (
                  <Chip
                    key={`in-${f.id}`}
                    label={f.label}
                    active={introFade === f.id}
                    onClick={() => setIntroFade(f.id)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Outro
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {FADES.map((f) => (
                  <Chip
                    key={`out-${f.id}`}
                    label={f.label}
                    active={outroFade === f.id}
                    onClick={() => setOutroFade(f.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        );

      case "transition":
        return (
          <div className="flex w-full min-w-0 flex-col gap-2">
            <p className="text-[10px] text-white/45">
              Applied between stitched clips when your source has multiple segments.
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {TRANSITIONS.map((t) => (
                <Chip
                  key={t.id}
                  label={t.label}
                  active={transition === t.id}
                  onClick={() => setTransition(t.id)}
                />
              ))}
            </div>
          </div>
        );

      case "text":
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <input
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value.slice(0, 120))}
              placeholder="Title / hook…"
              className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
            />
            <div className="flex gap-3 overflow-x-auto pb-1">
              {TEXT_STYLES.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  active={textStyle === s.id}
                  onClick={() => setTextStyle(s.id)}
                />
              ))}
            </div>
          </div>
        );

      case "captions":
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <input
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value.slice(0, 120))}
              placeholder="Caption / subtitle…"
              className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
            />
            <div className="flex gap-3 overflow-x-auto pb-1">
              {SUBTITLE_STYLES.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  active={subtitleStyle === s.id}
                  onClick={() => setSubtitleStyle(s.id)}
                />
              ))}
            </div>
          </div>
        );

      case "music":
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {(
                [
                  { id: "none" as const, label: "Off" },
                  { id: "auto" as const, label: "Auto" },
                  { id: "track" as const, label: "Pick" },
                ] as const
              ).map((m) => (
                <Chip
                  key={m.id}
                  label={m.label}
                  active={musicMode === m.id}
                  onClick={() => setMusicMode(m.id)}
                />
              ))}
            </div>
            {musicMode !== "none" && (
              <label className="block space-y-1 text-[10px] text-white/50">
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
                  className="w-full accent-[#E8A54B]"
                />
              </label>
            )}
            {musicMode === "track" && (
              <div className="max-h-[120px] space-y-1 overflow-y-auto">
                {musicLoading ? (
                  <p className="text-xs text-white/45">Loading…</p>
                ) : tracks.length === 0 ? (
                  <p className="text-xs text-white/45">No tracks found</p>
                ) : (
                  tracks.map((t) => {
                    const on = musicTrackId === t.id;
                    const playingTrack = playingMusicId === t.id;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                        style={{
                          background: on ? "rgba(232,165,75,0.12)" : "transparent",
                          border: `1px solid ${on ? "rgba(232,165,75,0.45)" : "transparent"}`,
                        }}
                      >
                        <button
                          type="button"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-white"
                          disabled={!t.previewUrl}
                          onClick={() => toggleMusicPreview(t)}
                        >
                          {playingTrack ? "■" : "▶"}
                        </button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setMusicTrackId(t.id)}
                        >
                          <span className="block truncate text-xs font-medium text-white">
                            {t.title}
                          </span>
                          <span className="block truncate text-[10px] text-white/45">
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
        );

      case "sound":
        return (
          <div className="flex gap-3 overflow-x-auto pb-1">
            <Chip
              label="Keep VO"
              active={keepOriginal}
              onClick={() => setKeepOriginal(true)}
            />
            <Chip
              label="Mute VO"
              active={!keepOriginal}
              onClick={() => setKeepOriginal(false)}
            />
          </div>
        );

      default:
        return null;
    }
  }

  const playheadPct = duration > 0 ? (current / duration) * 100 : 0;
  const trimStartPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimWidthPct =
    duration > 0 ? ((trimEnd - trimStart) / duration) * 100 : 100;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col text-white"
      style={{ background: "#0a0a0a" }}
    >
      {notice}

      <header
        className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3"
        style={{ background: "#0a0a0a" }}
      >
        <Link
          href={backHref}
          className="shrink-0 text-sm font-medium text-white/60 transition hover:text-white"
        >
          ← Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">
          Edit
        </h1>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void onExport()}
          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-black transition disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {exporting ? "…" : "Export"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
          <div
            className="relative w-full max-w-[280px] overflow-hidden rounded-xl bg-black shadow-2xl"
            style={{ aspectRatio: "9/16" }}
          >
            <video
              ref={videoRef}
              src={previewSrc}
              className="h-full w-full object-cover"
              style={{
                filter: effectCss === "none" ? undefined : effectCss,
              }}
              playsInline
              preload="metadata"
              onLoadedMetadata={onLoadedMeta}
              onClick={togglePlay}
            />

            {effect === "vignette" && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ boxShadow: "inset 0 0 60px 20px rgba(0,0,0,0.55)" }}
              />
            )}

            {overlayText.trim() && (
              <div className={`pointer-events-none ${overlayTextClass(textStyle)}`}>
                <span style={overlayTextStyle(textStyle)}>
                  {overlayText.trim().slice(0, 80)}
                </span>
              </div>
            )}

            {captionText.trim() && (
              <div className="pointer-events-none absolute inset-x-3 bottom-[10%] text-center">
                <span style={captionPreviewStyle(subtitleStyle)}>
                  {captionText.trim().slice(0, 80)}
                </span>
              </div>
            )}

            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35"
                aria-label="Play"
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-lg"
                  style={{ background: "rgba(0,0,0,0.55)" }}
                >
                  ▶
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <div className="mb-1 flex justify-between text-[10px] text-white/45">
            <span>{formatTime(current)}</span>
            <span>
              {formatTime(trimStart)} – {formatTime(trimEnd)}
            </span>
            <span>{formatTime(duration)}</span>
          </div>
          <div
            className="relative h-8 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seekTo(ratio);
            }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={current}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") seekTo(Math.max(0, (current - 1) / duration));
              if (e.key === "ArrowRight") seekTo(Math.min(1, (current + 1) / duration));
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/12" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
              style={{
                left: `${trimStartPct}%`,
                width: `${trimWidthPct}%`,
                background: "rgba(232,165,75,0.35)",
              }}
            />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
              style={{
                left: 0,
                width: `${playheadPct}%`,
                background: ACCENT,
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${playheadPct}%`, background: ACCENT }}
            />
          </div>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/10"
        style={{ background: "#111" }}
      >
        <div className="min-h-[132px] border-b border-white/8 px-4 py-3">
          {renderDockTools()}
        </div>

        <div className="flex gap-1 overflow-x-auto px-2 py-2">
          {CATEGORIES.map((c) => {
            const on = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition"
                style={{
                  background: on ? "rgba(232,165,75,0.16)" : "transparent",
                  color: on ? ACCENT : "rgba(255,255,255,0.5)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
