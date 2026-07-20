"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoiceItem = {
  id: string;
  name: string;
  category: string | null;
  labels: string | null;
  preview_url: string | null;
};

export function VoicePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/elevenlabs/voices");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErr(data.error || "Could not load voices");
          setVoices([]);
          return;
        }
        const list = (data.voices || []) as VoiceItem[];
        setVoices(list);
        if (value && !list.some((v) => v.id === value) && list[0]) {
          /* keep custom id if not in list */
        } else if (!value && list[0]) {
          onChange(list[0].id);
        }
      } catch {
        if (!cancelled) setErr("Network error loading voices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  async function play(voice: VoiceItem) {
    if (playingId === voice.id) {
      stop();
      return;
    }
    stop();
    setLoadingId(voice.id);
    setErr(null);
    try {
      let src = voice.preview_url;
      if (!src) {
        const res = await fetch(
          `/api/elevenlabs/preview?voiceId=${encodeURIComponent(voice.id)}`,
        );
        const type = res.headers.get("content-type") || "";
        if (type.includes("audio")) {
          src = URL.createObjectURL(await res.blob());
        } else {
          const data = await res.json();
          if (!res.ok) {
            setErr(data.error || "Preview failed");
            setLoadingId(null);
            return;
          }
          src = data.previewUrl as string;
        }
      }
      const audio = new Audio(src!);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => {
        setPlayingId(null);
        setErr("Playback failed");
      };
      setPlayingId(voice.id);
      await audio.play();
    } catch {
      setErr("Could not play preview");
      setPlayingId(null);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[color:var(--muted)]">Voice</span>
        {loading && (
          <span className="text-xs text-[color:var(--muted)]">Loading from ElevenLabs...</span>
        )}
      </div>

      {err && <p className="text-xs text-[color:var(--danger)]">{err}</p>}

      {!loading && voices.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">No voices found.</p>
      )}

      <div className="max-h-[320px] space-y-1.5 overflow-y-auto rounded-xl border border-[color:var(--line)] p-2">
        {voices.map((v) => {
          const selected = value === v.id;
          const playing = playingId === v.id;
          const busy = loadingId === v.id;
          return (
            <div
              key={v.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition"
              style={{
                background: selected ? "rgba(232,165,75,0.12)" : "transparent",
                border: `1px solid ${selected ? "rgba(232,165,75,0.45)" : "transparent"}`,
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
                disabled={busy}
                aria-label={playing ? "Stop" : "Play"}
                onClick={(e) => {
                  e.stopPropagation();
                  void play(v);
                }}
              >
                {busy ? "..." : playing ? "■" : "▶"}
              </button>

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onChange(v.id);
                }}
              >
                <span className="block truncate text-sm font-medium">{v.name}</span>
                <span className="block truncate text-[11px] text-[color:var(--muted)]">
                  {[v.category, v.labels].filter(Boolean).join(" · ") || v.id}
                </span>
              </button>

              {selected && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                  Selected
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
