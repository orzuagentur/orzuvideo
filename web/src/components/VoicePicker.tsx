"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastNotice";

type VoiceItem = {
  id: string;
  name: string;
  category: string | null;
  labels: string | null;
  gender: string | null;
  accent: string | null;
  age: string | null;
  preview_url: string | null;
  source?: "account" | "shared";
};

type GenderFilter = "all" | "male" | "female" | "neutral";

export function VoicePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { show: toast, notice } = useToast();
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<GenderFilter>("all");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (search: string, g: GenderFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (g !== "all") params.set("gender", g);
      const res = await fetch(`/api/elevenlabs/voices?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to load voices", "error");
        setVoices([]);
        return;
      }
      const list = (data.voices || []) as VoiceItem[];
      setVoices(list);
    } catch {
      toast("Network error while loading voices", "error");
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load("", "all");
    return () => {
      audioRef.current?.pause();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  // Auto-select first voice only when empty and list arrives
  useEffect(() => {
    if (!value && voices[0]) onChange(voices[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices]);

  function onSearchChange(next: string) {
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(next, gender);
    }, 320);
  }

  function onGenderChange(next: GenderFilter) {
    setGender(next);
    void load(q, next);
  }

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
            toast(data.error || "Failed to preview", "error");
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
        toast("Playback error", "error");
      };
      setPlayingId(voice.id);
      await audio.play();
    } catch {
      toast("Failed to preview", "error");
      setPlayingId(null);
    } finally {
      setLoadingId(null);
    }
  }

  const filters: { id: GenderFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "male", label: "Male" },
    { id: "female", label: "Female" },
    { id: "neutral", label: "Neutral" },
  ];

  return (
    <div className="space-y-3">
      {notice}
      <input
        className="field w-full text-sm"
        placeholder="Search voice"
        value={q}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const on = gender === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onGenderChange(f.id)}
              className="rounded-full border px-3 py-1 text-xs transition"
              style={{
                borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                background: on ? "rgba(232,165,75,0.14)" : "transparent",
                color: on ? "var(--accent)" : "var(--muted)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {!loading && voices.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          No voices found. Change the filter or search.
        </p>
      )}

      <div className="max-h-[360px] space-y-1.5 overflow-y-auto rounded-xl border border-[color:var(--line)] p-2">
        {voices.map((v) => {
          const isSelected = value === v.id;
          const playing = playingId === v.id;
          const busy = loadingId === v.id;
          return (
            <div
              key={`${v.source || "v"}-${v.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition"
              style={{
                background: isSelected
                  ? "rgba(232,165,75,0.12)"
                  : "transparent",
                border: `1px solid ${
                  isSelected ? "rgba(232,165,75,0.45)" : "transparent"
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
                onClick={() => onChange(v.id)}
              >
                <span className="block truncate text-sm font-medium">
                  {v.name}
                  {v.source === "shared" ? (
                    <span className="ml-1 text-[10px] font-normal text-[color:var(--muted)]">
                      shared
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-[color:var(--muted)]">
                  {[v.gender, v.accent, v.age, v.category]
                    .filter(Boolean)
                    .join(" · ") ||
                    v.labels ||
                    v.id}
                </span>
              </button>

              {isSelected && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
