"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AiTraining } from "@/lib/types";

const defaults: AiTraining = {
  niche: "motivation",
  content_type: "motivational_quotes",
  style_prompt:
    "Powerful male narrator. Short punchy lines about discipline, focus, and building a better life. Never soft. Always cinematic.",
  tone: "powerful",
  language: "en",
  target_audience: "ambitious young men 18-35",
  hook_style: "bold opening challenge",
  cta: "Follow for daily fire",
  pexels_query: "cinematic man walking city night",
  music_mood: "cinematic motivational",
  voice_id: "21m00Tcm4TlvDq8ikWAM",
  subtitle_style: "karaoke_bold",
  duration_seconds: 45,
  is_trained: false,
};

export function TrainingForm({ initial }: { initial: AiTraining | null }) {
  const router = useRouter();
  const [form, setForm] = useState<AiTraining>({ ...defaults, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function set<K extends keyof AiTraining>(key: K, value: AiTraining[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);

    const res = await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }

    setOk("AI trained. Daily Shorts will follow this blueprint.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel rise space-y-5 p-6">
      <Field label="Niche">
        <input
          className="field"
          value={form.niche}
          onChange={(e) => set("niche", e.target.value)}
          required
        />
      </Field>

      <Field label="Content type">
        <input
          className="field"
          value={form.content_type}
          onChange={(e) => set("content_type", e.target.value)}
          required
        />
      </Field>

      <Field label="Full training prompt (most important)">
        <textarea
          className="field min-h-40"
          value={form.style_prompt}
          onChange={(e) => set("style_prompt", e.target.value)}
          required
          placeholder="Describe exactly what content to create every day..."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone">
          <input
            className="field"
            value={form.tone}
            onChange={(e) => set("tone", e.target.value)}
          />
        </Field>
        <Field label="Language">
          <input
            className="field"
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
          />
        </Field>
        <Field label="Audience">
          <input
            className="field"
            value={form.target_audience}
            onChange={(e) => set("target_audience", e.target.value)}
          />
        </Field>
        <Field label="Hook style">
          <input
            className="field"
            value={form.hook_style}
            onChange={(e) => set("hook_style", e.target.value)}
          />
        </Field>
        <Field label="CTA">
          <input
            className="field"
            value={form.cta}
            onChange={(e) => set("cta", e.target.value)}
          />
        </Field>
        <Field label="Duration (seconds)">
          <input
            className="field"
            type="number"
            min={20}
            max={59}
            value={form.duration_seconds}
            onChange={(e) => set("duration_seconds", Number(e.target.value))}
          />
        </Field>
        <Field label="Pexels search (man / vibe)">
          <input
            className="field"
            value={form.pexels_query}
            onChange={(e) => set("pexels_query", e.target.value)}
          />
        </Field>
        <Field label="Music mood">
          <input
            className="field"
            value={form.music_mood}
            onChange={(e) => set("music_mood", e.target.value)}
          />
        </Field>
        <Field label="ElevenLabs voice ID">
          <input
            className="field"
            value={form.voice_id}
            onChange={(e) => set("voice_id", e.target.value)}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
      {ok && <p className="text-sm text-[color:var(--success)]">{ok}</p>}

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save AI training"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-[color:var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
