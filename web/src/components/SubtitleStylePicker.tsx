"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SUBTITLE_STYLES } from "@/lib/editor-catalog";

export type SubtitleStyleId = (typeof SUBTITLE_STYLES)[number]["id"];

/** Full sentence for live karaoke-style preview on each subtitle card */
const PREVIEW_SENTENCE =
  "This is how your subtitles look on the clip";
const PREVIEW_WORDS = PREVIEW_SENTENCE.split(/\s+/);
/** Match burned ASS: ~3 words on screen, then advance to the next group */
const PREVIEW_CHUNK = 3;

/** One square stock photo per style (Unsplash — free to display) */
export const SUBTITLE_PREVIEW_BG: Record<SubtitleStyleId, string> = {
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

/** Map legacy training ids → current catalog */
export function normalizeSubtitleStyle(
  raw: string | null | undefined,
): SubtitleStyleId {
  const v = String(raw || "").trim();
  if (SUBTITLE_STYLES.some((s) => s.id === v)) {
    return v as SubtitleStyleId;
  }
  if (v === "karaoke_bold" || v === "karaoke") return "karaoke_gold";
  return "classic";
}

export function liveSubtitleStyle(style: SubtitleStyleId): CSSProperties {
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

export function SubtitleStyleCard({
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
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition sm:rounded-xl disabled:opacity-55"
      style={{
        borderColor: active ? "rgba(232,165,75,0.55)" : "var(--line)",
        background: active ? "rgba(232,165,75,0.1)" : "rgba(0,0,0,0.25)",
        boxShadow: active ? "0 0 0 1px rgba(232,165,75,0.25)" : undefined,
      }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/40 sm:aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex min-h-[40%] items-end justify-center px-1 pb-1.5 pt-3 sm:px-2.5 sm:pb-3 sm:pt-6">
          <span
            style={{
              ...css,
              fontSize: "0.52rem",
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
      <span className="truncate px-1 py-1 text-center text-[9px] font-semibold sm:px-2 sm:py-1.5 sm:text-left sm:text-[11px]">
        {style.label}
      </span>
    </button>
  );
}

/**
 * Collapsible subtitle style list — live preview cards like AI Clipping.
 * Mobile: 3 columns; sm+: 4 columns.
 */
export function SubtitleStylePicker({
  value,
  onChange,
  disabled,
  className = "",
  defaultOpen = false,
}: {
  value: string;
  onChange: (id: SubtitleStyleId) => void;
  disabled?: boolean;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const current = normalizeSubtitleStyle(value);
  const label =
    SUBTITLE_STYLES.find((s) => s.id === current)?.label || "Classic";
  const headerBg = SUBTITLE_PREVIEW_BG[current];

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)] ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left disabled:opacity-55"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[color:var(--line)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headerBg}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <span
              className="absolute inset-x-0 bottom-0.5 text-center"
              style={{
                ...liveSubtitleStyle(current),
                fontSize: "0.45rem",
                lineHeight: 1,
              }}
            >
              Aa
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Subtitles
            </span>
            <span className="block truncate text-sm font-medium">{label}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-[color:var(--muted)]">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[color:var(--line)] p-2.5 sm:p-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SUBTITLE_STYLES.map((s) => (
              <SubtitleStyleCard
                key={s.id}
                style={s}
                active={current === s.id}
                disabled={disabled}
                onSelect={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
