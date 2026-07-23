"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoicePicker } from "@/components/VoicePicker";
import { useToast } from "@/components/ToastNotice";
import {
  clampMusicVolume,
  clampVoiceVolume,
  LIBRARY_GROUP_DEMO_TEXT,
} from "@/lib/music-groups";

type DemoTrack = {
  id: string;
  name: string;
  artist: string;
  previewUrl: string | null;
};

/**
 * Voice picker + one system background track for volume/demo listen.
 * AI picks real music by niche at publish time — no user music library here.
 */
export function TrainingVoiceMusicCard({
  voiceId,
  onVoiceChange,
  musicVolume,
  voiceVolume,
  onMusicVolumeChange,
  onVoiceVolumeChange,
}: {
  voiceId: string;
  onVoiceChange: (id: string) => void;
  musicVolume: number;
  voiceVolume: number;
  onMusicVolumeChange: (v: number) => void;
  onVoiceVolumeChange: (v: number) => void;
}) {
  const { show: toast, notice } = useToast();
  const [track, setTrack] = useState<DemoTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [demoOn, setDemoOn] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef<string | null>(null);

  const mv = clampMusicVolume(musicVolume);
  const vv = clampVoiceVolume(voiceVolume);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/music/group", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const list = (data.tracks || []) as DemoTrack[];
        const first = list.find((t) => t.previewUrl) || null;
        setTrack(first);
      } catch {
        if (!cancelled) setTrack(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopAll = useCallback(() => {
    musicRef.current?.pause();
    musicRef.current = null;
    voiceRef.current?.pause();
    voiceRef.current = null;
    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
      voiceUrlRef.current = null;
    }
    setPlaying(false);
    setDemoOn(false);
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  function playMusicOnly() {
    if (!track?.previewUrl) return;
    if (playing && !demoOn) {
      stopAll();
      return;
    }
    stopAll();
    const a = new Audio(track.previewUrl);
    a.volume = mv;
    a.onended = () => setPlaying(false);
    musicRef.current = a;
    void a.play().catch(() => toast("Playback blocked — tap again", "error"));
    setPlaying(true);
  }

  async function playDemo() {
    if (!voiceId.trim()) {
      toast("Choose a voice first", "error");
      return;
    }
    if (!track?.previewUrl) {
      toast("Demo track not available yet", "error");
      return;
    }
    stopAll();
    setDemoOn(true);
    setPlaying(true);
    try {
      const res = await fetch("/api/elevenlabs/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId,
          groupId: "library",
          text: LIBRARY_GROUP_DEMO_TEXT,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Demo failed",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      voiceUrlRef.current = url;

      const music = new Audio(track.previewUrl);
      music.volume = mv;
      music.loop = true;
      musicRef.current = music;

      const voice = new Audio(url);
      voice.volume = Math.min(1, Math.max(0.4, vv / 1.4));
      voiceRef.current = voice;
      voice.onended = () => {
        music.pause();
        stopAll();
      };

      await music.play();
      await voice.play();
    } catch (e) {
      stopAll();
      toast(e instanceof Error ? e.message : "Demo failed", "error");
    }
  }

  return (
    <section className="panel rise space-y-5 p-6">
      {notice}
      <div>
        <h2 className="text-lg font-semibold">
          Voice & music{" "}
          <span className="text-[color:var(--danger)]" aria-hidden>
            *
          </span>
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Pick a voice. Background music is chosen by AI from your niche —
          listen to the system demo mix below.
        </p>
      </div>

      <VoicePicker value={voiceId} onChange={onVoiceChange} />

      <div className="space-y-4 border-t border-[color:var(--line)] pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Background music
          </p>
          <p className="mt-1 text-[11px] text-[color:var(--muted)]">
            One system track for testing levels. Final videos use AI-matched
            music by theme.
          </p>
        </div>

        <div
          className="flex items-center gap-3 rounded-xl border px-3 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            type="button"
            disabled={loading || !track?.previewUrl}
            onClick={playMusicOnly}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm transition disabled:opacity-40"
            style={{
              background:
                playing && !demoOn
                  ? "rgba(232,165,75,0.9)"
                  : "rgba(255,255,255,0.08)",
              color: playing && !demoOn ? "#111" : "var(--fg)",
            }}
            aria-label={playing && !demoOn ? "Stop" : "Play demo music"}
          >
            {playing && !demoOn ? "■" : "▶"}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {loading
                ? "Loading…"
                : track?.name || "System demo track"}
            </p>
            <p className="truncate text-[11px] text-[color:var(--muted)]">
              {track?.artist || "OrzuAi test bed"}
            </p>
          </div>
          <button
            type="button"
            disabled={loading || !track?.previewUrl || !voiceId}
            onClick={() => void playDemo()}
            className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-40"
            style={{
              borderColor: demoOn
                ? "rgba(232,165,75,0.55)"
                : "var(--line)",
              color: demoOn ? "var(--accent)" : "var(--fg)",
              background: demoOn
                ? "rgba(232,165,75,0.12)"
                : "transparent",
            }}
          >
            {demoOn ? "Stop demo" : "Demo listen"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[color:var(--muted)]">
              Music volume
            </span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.01}
              value={mv}
              onChange={(e) => {
                const v = clampMusicVolume(Number(e.target.value));
                onMusicVolumeChange(v);
                if (musicRef.current) musicRef.current.volume = v;
              }}
              className="w-full"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[color:var(--muted)]">
              Voice volume
            </span>
            <input
              type="range"
              min={0.5}
              max={1.4}
              step={0.01}
              value={vv}
              onChange={(e) => {
                const v = clampVoiceVolume(Number(e.target.value));
                onVoiceVolumeChange(v);
                if (voiceRef.current) {
                  voiceRef.current.volume = Math.min(1, Math.max(0.4, v / 1.4));
                }
              }}
              className="w-full"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
