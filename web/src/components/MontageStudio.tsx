"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const ALL_TRANSITIONS = [
  "fade",
  "fadeblack",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "smoothleft",
  "smoothright",
  "circleopen",
  "circleclose",
  "dissolve",
  "radial",
  "pixelize",
  "diagtl",
  "diagtr",
  "hlslice",
  "hblur",
];

const ALL_MOTIONS = [
  "punch_in",
  "slow_push",
  "rise",
  "drift_left",
  "drift_right",
  "snap_zoom",
];

type Settings = {
  clip_count: number;
  music_mood: string;
  music_volume_hook: number;
  music_volume_body: number;
  voice_volume: number;
  transitions_enabled: boolean;
  motions_enabled: boolean;
  punch_first_clip: boolean;
  enabled_transitions: string[];
  enabled_motions: string[];
  avoid_reuse_days: number;
};

const TOOLS = [
  {
    name: "Hook punch (first 3s)",
    detail: "First clip always punch_in + louder music bed for scroll-stop.",
  },
  {
    name: "Clip normalize / crop",
    detail: "Portrait 1080×1920, Ken Burns zoom, color grade per motion preset.",
  },
  {
    name: "xfade transitions",
    detail: "Professional ffmpeg transitions between B-roll clips (no hard cuts only).",
  },
  {
    name: "Pexels B-roll picker",
    detail: "Downloads fresh stock clips; never reuses IDs from older videos.",
  },
  {
    name: "Jamendo music bed",
    detail: "Motivational / epic instrumental, louder mix; skips used tracks.",
  },
  {
    name: "ASS captions + hook text",
    detail: "Burned-in subtitles with emphasis words and opening hook overlay.",
  },
  {
    name: "Audio loudnorm mix",
    detail: "Voice + BGM mix with hook/body music volumes you set below.",
  },
];

export function MontageStudio({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/montage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Save failed — run migration 007 in Supabase");
      return;
    }
    setMsg("Montage settings saved for the worker.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Montage</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          Worker tools for YouTube Shorts: cuts, transitions, motions, music volume,
          and anti-reuse of old clips.
        </p>
      </header>

      <section className="panel rise space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          Worker toolkit
        </h2>
        <ul className="space-y-2 text-sm">
          {TOOLS.map((t) => (
            <li key={t.name} className="border-b border-[color:var(--line)] pb-2 last:border-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-[color:var(--muted)]">{t.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={onSubmit} className="panel rise space-y-5 p-6">
        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Clips per Short (3–8)</span>
          <input
            className="field"
            type="number"
            min={3}
            max={8}
            value={form.clip_count}
            onChange={(e) =>
              setForm((p) => ({ ...p, clip_count: Number(e.target.value) }))
            }
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Music mood (Jamendo)</span>
          <input
            className="field"
            value={form.music_mood}
            onChange={(e) => setForm((p) => ({ ...p, music_mood: e.target.value }))}
            placeholder="motivational epic"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">BGM hook vol</span>
            <input
              className="field"
              type="number"
              step={0.01}
              min={0.3}
              max={1.2}
              value={form.music_volume_hook}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  music_volume_hook: Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">BGM body vol</span>
            <input
              className="field"
              type="number"
              step={0.01}
              min={0.2}
              max={1}
              value={form.music_volume_body}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  music_volume_body: Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">Voice vol</span>
            <input
              className="field"
              type="number"
              step={0.01}
              min={0.7}
              max={1.4}
              value={form.voice_volume}
              onChange={(e) =>
                setForm((p) => ({ ...p, voice_volume: Number(e.target.value) }))
              }
            />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">
            Don&apos;t reuse Pexels/music for (days)
          </span>
          <input
            className="field"
            type="number"
            min={7}
            max={365}
            value={form.avoid_reuse_days}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                avoid_reuse_days: Number(e.target.value),
              }))
            }
          />
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["transitions_enabled", "Transitions"],
              ["motions_enabled", "Motions"],
              ["punch_first_clip", "Punch first clip"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) =>
                  setForm((p) => ({ ...p, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm text-[color:var(--muted)]">Transitions</p>
          <div className="flex flex-wrap gap-2">
            {ALL_TRANSITIONS.map((t) => {
              const on = form.enabled_transitions.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className="rounded-full px-2.5 py-1 text-xs"
                  style={{
                    border: `1px solid ${on ? "rgba(232,165,75,0.5)" : "var(--line)"}`,
                    color: on ? "var(--accent)" : "var(--muted)",
                  }}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      enabled_transitions: toggle(p.enabled_transitions, t),
                    }))
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-[color:var(--muted)]">Motions</p>
          <div className="flex flex-wrap gap-2">
            {ALL_MOTIONS.map((t) => {
              const on = form.enabled_motions.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className="rounded-full px-2.5 py-1 text-xs"
                  style={{
                    border: `1px solid ${on ? "rgba(232,165,75,0.5)" : "var(--line)"}`,
                    color: on ? "var(--accent)" : "var(--muted)",
                  }}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      enabled_motions: toggle(p.enabled_motions, t),
                    }))
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}
        {msg && <p className="text-sm text-[color:var(--success)]">{msg}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save montage"}
        </button>
      </form>
    </div>
  );
}
