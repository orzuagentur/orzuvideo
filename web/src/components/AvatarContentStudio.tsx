"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AvatarJob = {
  id: string;
  status: string;
  title: string | null;
  caption: string | null;
  preview_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type Defaults = {
  heygen_avatar_id: string;
  heygen_avatar_name: string;
  voice_id: string;
  duration_seconds: number;
  language: string;
  tone: string;
  style_prompt: string;
  hook_style: string;
  cta: string;
};

type HeygenLook = {
  id: string;
  name: string;
  preview_image_url: string | null;
};

const LABEL: Record<string, string> = {
  queued: "Queued",
  generating_script: "ChatGPT script...",
  generating_voice: "ElevenLabs voice...",
  generating_avatar: "HeyGen avatar...",
  editing: "Saving preview...",
  ready: "Ready - download",
  failed: "Failed",
};

export function AvatarContentStudio({
  jobs,
  defaults,
}: {
  jobs: AvatarJob[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [looks, setLooks] = useState<HeygenLook[]>([]);

  const [brief, setBrief] = useState("");
  const [duration, setDuration] = useState(defaults.duration_seconds || 30);
  const [language, setLanguage] = useState(defaults.language || "en");
  const [tone, setTone] = useState(defaults.tone || "friendly");
  const [voiceId, setVoiceId] = useState(defaults.voice_id || "");
  const [avatarId, setAvatarId] = useState(defaults.heygen_avatar_id || "");
  const [stylePrompt, setStylePrompt] = useState(defaults.style_prompt || "");
  const [hookStyle, setHookStyle] = useState(defaults.hook_style || "");
  const [cta, setCta] = useState(defaults.cta || "");

  useEffect(() => {
    void fetch("/api/heygen/avatars")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.avatars)) setLooks(d.avatars);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [router]);

  const sorted = useMemo(
    () => [...jobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [jobs],
  );

  async function createVideo() {
    const text = brief.trim();
    if (text.length < 8) {
      setMsg("Write at least a short idea for the video.");
      return;
    }
    setBusy("create");
    setMsg(null);
    const res = await fetch("/api/avatar/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: text,
        duration_seconds: duration,
        language,
        tone,
        voice_id: voiceId,
        heygen_avatar_id: avatarId,
        style_prompt: stylePrompt,
        hook_style: hookStyle,
        cta,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Failed to queue");
      return;
    }
    setBrief("");
    setShowCreate(false);
    setMsg("Generating: ChatGPT -> ElevenLabs -> HeyGen. Download when Ready.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Generate avatar video</h2>
          <p className="mt-1 max-w-xl text-sm text-[color:var(--muted)]">
            GPT script + ElevenLabs voice + HeyGen avatar. Preview and download MP4.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary h-11 w-11 rounded-full text-2xl leading-none"
          onClick={() => setShowCreate(true)}
          aria-label="Create video"
        >
          +
        </button>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.length === 0 && (
          <p className="panel col-span-full p-8 text-center text-sm text-[color:var(--muted)]">
            No avatar videos yet. Tap + to generate.
          </p>
        )}
        {sorted.map((job) => (
          <article
            key={job.id}
            className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]"
          >
            <div className="aspect-[9/16] max-h-[420px] bg-black/40">
              {job.preview_url ? (
                <video
                  src={job.preview_url}
                  className="h-full w-full object-cover"
                  controls
                  playsInline
                />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-[color:var(--muted)]">
                  {LABEL[job.status] || job.status}
                </div>
              )}
            </div>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 text-sm font-semibold">
                {job.title || "Untitled"}
              </p>
              <p className="text-xs text-[color:var(--muted)]">
                {LABEL[job.status] || job.status}
                {job.error_message ? ` - ${job.error_message.slice(0, 100)}` : ""}
              </p>
              {job.preview_url && (
                <a
                  href={job.preview_url}
                  download={`${(job.title || "avatar").slice(0, 40)}.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary text-xs"
                >
                  Download
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => busy !== "create" && setShowCreate(false)}
          role="presentation"
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="text-lg font-semibold">Generate avatar video</h2>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[color:var(--muted)]">Brief / prompt</span>
              <textarea
                className="field min-h-[120px]"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Topic, hook, CTA..."
                autoFocus
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[color:var(--muted)]">Style prompt (GPT)</span>
              <textarea
                className="field min-h-[72px]"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">Duration (sec)</span>
                <input
                  className="field"
                  type="number"
                  min={15}
                  max={90}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">Language</span>
                <input
                  className="field"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">Tone</span>
                <input
                  className="field"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">ElevenLabs voice ID</span>
                <input
                  className="field font-mono text-xs"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">Hook style</span>
                <input
                  className="field"
                  value={hookStyle}
                  onChange={(e) => setHookStyle(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--muted)]">CTA</span>
                <input
                  className="field"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[color:var(--muted)]">HeyGen style</span>
              {looks.length > 0 ? (
                <select
                  className="field"
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                >
                  {!avatarId && <option value="">Select style...</option>}
                  {looks.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="field font-mono text-xs"
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                  placeholder="HeyGen avatar / look id"
                />
              )}
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy === "create"}
                onClick={() => void createVideo()}
              >
                {busy === "create" ? "Queuing..." : "Generate video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
