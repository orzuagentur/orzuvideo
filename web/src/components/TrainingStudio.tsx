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
  video_format: "shorts",
  video_style: "cinematic_mixer",
  reply_comments_enabled: false,
  reply_languages: "auto",
  reply_style_prompt:
    "Reply warmly in the commenter's language. Keep it short. Stay on-brand. Never argue. Invite them to the next Short.",
  learning_enabled: true,
  brand_rules: "Never mention politics. Never sell hard. No links in replies.",
  is_trained: false,
};

export function TrainingStudio({ initial }: { initial: AiTraining | null }) {
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
    setOk("AI training saved. The model will follow this blueprint and learn from replies.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">AI Training</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          Full-screen training studio. Define format, style, comment permissions
          and self-learning rules once — the engine follows them every day.
        </p>
      </header>

      <section className="panel rise grid gap-5 p-6 lg:grid-cols-2">
        <h2 className="lg:col-span-2 text-lg font-semibold">Content DNA</h2>
        <Field label="Niche">
          <input className="field" value={form.niche} onChange={(e) => set("niche", e.target.value)} required />
        </Field>
        <Field label="Content type">
          <input className="field" value={form.content_type} onChange={(e) => set("content_type", e.target.value)} required />
        </Field>
        <Field label="Video format">
          <select className="field" value={form.video_format} onChange={(e) => set("video_format", e.target.value)}>
            <option value="shorts">YouTube Shorts (9:16)</option>
            <option value="shorts_mixer">Shorts mixer (multi-clip)</option>
            <option value="reel_style">Reel-style cut</option>
          </select>
        </Field>
        <Field label="Edit style">
          <select className="field" value={form.video_style} onChange={(e) => set("video_style", e.target.value)}>
            <option value="cinematic_mixer">Cinematic mixer</option>
            <option value="fast_cuts">Fast cuts</option>
            <option value="slow_zoom">Slow zoom story</option>
            <option value="karaoke_focus">Karaoke focus</option>
          </select>
        </Field>
        <Field label="Full training prompt">
          <textarea
            className="field min-h-44 lg:col-span-2"
            value={form.style_prompt}
            onChange={(e) => set("style_prompt", e.target.value)}
            required
          />
        </Field>
        <div className="lg:col-span-2 grid gap-5 sm:grid-cols-2">
          <Field label="Tone">
            <input className="field" value={form.tone} onChange={(e) => set("tone", e.target.value)} />
          </Field>
          <Field label="Main language">
            <input className="field" value={form.language} onChange={(e) => set("language", e.target.value)} />
          </Field>
          <Field label="Audience">
            <input className="field" value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)} />
          </Field>
          <Field label="Hook style">
            <input className="field" value={form.hook_style} onChange={(e) => set("hook_style", e.target.value)} />
          </Field>
          <Field label="CTA">
            <input className="field" value={form.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
          <Field label="Duration (sec)">
            <input
              className="field"
              type="number"
              min={20}
              max={59}
              value={form.duration_seconds}
              onChange={(e) => set("duration_seconds", Number(e.target.value))}
            />
          </Field>
          <Field label="Pexels query">
            <input className="field" value={form.pexels_query} onChange={(e) => set("pexels_query", e.target.value)} />
          </Field>
          <Field label="Jamendo music mood">
            <input className="field" value={form.music_mood} onChange={(e) => set("music_mood", e.target.value)} />
          </Field>
          <Field label="ElevenLabs voice ID">
            <input className="field" value={form.voice_id} onChange={(e) => set("voice_id", e.target.value)} />
          </Field>
          <Field label="Subtitle style">
            <input className="field" value={form.subtitle_style} onChange={(e) => set("subtitle_style", e.target.value)} />
          </Field>
        </div>
        <Field label="Brand rules">
          <textarea
            className="field min-h-28"
            value={form.brand_rules}
            onChange={(e) => set("brand_rules", e.target.value)}
          />
        </Field>
      </section>

      <section className="panel rise-delay grid gap-5 p-6 lg:grid-cols-2">
        <h2 className="lg:col-span-2 text-lg font-semibold">Comments & self-learning</h2>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.reply_comments_enabled}
            onChange={(e) => set("reply_comments_enabled", e.target.checked)}
          />
          Allow AI to reply to all comments (any language)
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.learning_enabled}
            onChange={(e) => set("learning_enabled", e.target.checked)}
          />
          Learn from own reply experience over time
        </label>
        <Field label="Reply languages">
          <select
            className="field"
            value={form.reply_languages}
            onChange={(e) => set("reply_languages", e.target.value)}
          >
            <option value="auto">Auto-detect (any language)</option>
            <option value="en">English only</option>
            <option value="ru">Russian only</option>
            <option value="de">German only</option>
          </select>
        </Field>
        <Field label="Reply style prompt">
          <textarea
            className="field min-h-32"
            value={form.reply_style_prompt}
            onChange={(e) => set("reply_style_prompt", e.target.value)}
          />
        </Field>
      </section>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
      {ok && <p className="text-sm text-[color:var(--success)]">{ok}</p>}

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save full AI training"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-[color:var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
