"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Form = {
  niche: string;
  content_type: string;
  style_prompt: string;
  tone: string;
  language: string;
  target_audience: string;
  hook_style: string;
  cta: string;
  music_mood: string;
  voice_id: string;
  duration_seconds: number;
  brand_rules: string;
};

export function InstagramTrainingStudio({ initial }: { initial: Form }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/instagram/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setMsg("Instagram AI training saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">AI Training</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Style for Instagram Reels only — independent from YouTube training.
        </p>
      </header>

      {msg && <p className="text-sm text-[color:var(--success)]">{msg}</p>}
      {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}

      <form onSubmit={onSubmit} className="panel rise space-y-4 p-6">
        {(
          [
            ["niche", "Niche"],
            ["content_type", "Content type"],
            ["tone", "Tone"],
            ["language", "Language"],
            ["target_audience", "Audience"],
            ["hook_style", "Hook style"],
            ["cta", "CTA"],
            ["music_mood", "Music mood"],
            ["voice_id", "ElevenLabs voice ID"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">{label}</span>
            <input
              className="field"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Style prompt</span>
          <textarea
            className="field min-h-[120px]"
            value={form.style_prompt}
            onChange={(e) => set("style_prompt", e.target.value)}
            required
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Brand rules</span>
          <textarea
            className="field min-h-[80px]"
            value={form.brand_rules}
            onChange={(e) => set("brand_rules", e.target.value)}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Duration (seconds)</span>
          <input
            className="field"
            type="number"
            min={15}
            max={90}
            value={form.duration_seconds}
            onChange={(e) => set("duration_seconds", Number(e.target.value))}
          />
        </label>

        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save Instagram training"}
        </button>
      </form>
    </div>
  );
}
