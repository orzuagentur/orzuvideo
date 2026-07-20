"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { AiTraining, PublishSchedule } from "@/lib/types";
import {
  ScheduleStudio,
  normalizeSchedule,
  scheduleDefaults,
} from "@/components/ScheduleStudio";
import { VoicePicker } from "@/components/VoicePicker";
import {
  AUDIENCE_PRESETS,
  BRAND_RULES_PRESETS,
  CONTENT_TYPE_PRESETS,
  CTA_PRESETS,
  DURATION_PRESETS,
  HOOK_PRESETS,
  LANGUAGE_PRESETS,
  MUSIC_MOOD_PRESETS,
  NICHE_PRESETS,
  PEXELS_PRESETS,
  REPLY_STYLE_PRESETS,
  STYLE_PROMPT_PRESETS,
  SUBTITLE_PRESETS,
  TONE_PRESETS,
  VIDEO_FORMAT_PRESETS,
  VIDEO_STYLE_PRESETS,
  VOICE_PRESETS,
  ensurePreset,
  type Preset,
} from "@/lib/training-presets";

const trainingDefaults: AiTraining = {
  niche: "motivation",
  content_type: "motivational_quotes",
  style_prompt: STYLE_PROMPT_PRESETS[0].value,
  tone: "powerful",
  language: "en",
  target_audience: "ambitious young men 18-35",
  hook_style: "bold opening challenge",
  cta: "Follow for daily fire",
  pexels_query: "cinematic man walking city night",
  music_mood: "motivational epic",
  voice_id: VOICE_PRESETS[0].value,
  subtitle_style: "karaoke_bold",
  duration_seconds: 45,
  video_format: "shorts",
  video_style: "cinematic_mixer",
  reply_comments_enabled: false,
  reply_languages: "auto",
  reply_style_prompt: REPLY_STYLE_PRESETS[0].value,
  learning_enabled: false,
  brand_rules: BRAND_RULES_PRESETS[0].value,
  is_trained: false,
};

function snapshot(training: AiTraining, schedule: PublishSchedule) {
  return JSON.stringify({ training, schedule: normalizeSchedule(schedule) });
}

export function TrainingStudio({
  initial,
  schedule: scheduleInitial,
  channelTitle = null,
}: {
  initial: AiTraining | null;
  schedule: PublishSchedule | null;
  embeddedInChannel?: boolean;
  channelTitle?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<AiTraining>({
    ...trainingDefaults,
    ...initial,
    learning_enabled: false,
  });
  const [schedule, setSchedule] = useState<PublishSchedule>(() =>
    normalizeSchedule({ ...scheduleDefaults, ...scheduleInitial }),
  );
  const savedRef = useRef(snapshot(form, schedule));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<string | null>(null);
  const allowLeaveRef = useRef(false);

  const markDirty = useCallback(
    (nextForm: AiTraining, nextSchedule: PublishSchedule) => {
      setDirty(snapshot(nextForm, nextSchedule) !== savedRef.current);
    },
    [],
  );

  function setTraining<K extends keyof AiTraining>(
    key: K,
    value: AiTraining[K],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      markDirty(next, schedule);
      return next;
    });
  }

  function onScheduleChange(next: PublishSchedule) {
    const normalized = normalizeSchedule(next);
    setSchedule(normalized);
    markDirty(form, normalized);
  }

  async function saveAll(options?: {
    goToChannel?: boolean;
  }): Promise<boolean> {
    setBusy(true);
    setError(null);
    setOk(null);

    const schedulePayload = normalizeSchedule(schedule);
    if (schedulePayload.enabled) {
      const unique = new Set(schedulePayload.times);
      if (unique.size !== schedulePayload.times.length) {
        setError("Each publish time must be different.");
        setBusy(false);
        return false;
      }
    }

    const trainingBody = { ...form, learning_enabled: false };

    const [trainRes, schedRes] = await Promise.all([
      fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trainingBody),
      }),
      fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedulePayload),
      }),
    ]);

    const trainData = await trainRes.json();
    const schedData = await schedRes.json();
    setBusy(false);

    if (!trainRes.ok) {
      setError(trainData.error || "Training save failed");
      return false;
    }
    if (!schedRes.ok) {
      setError(schedData.error || "Schedule save failed");
      return false;
    }

    savedRef.current = snapshot(trainingBody, schedulePayload);
    setForm(trainingBody);
    setSchedule(schedulePayload);
    setDirty(false);
    setOk("Saved.");
    if (options?.goToChannel) {
      allowLeaveRef.current = true;
      router.push("/dashboard/channel");
      router.refresh();
    } else {
      router.refresh();
    }
    return true;
  }

  function goBack() {
    if (dirty) {
      setLeavePrompt("/dashboard/channel");
      return;
    }
    allowLeaveRef.current = true;
    router.push("/dashboard/channel");
  }

  // Browser tab close / refresh
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty || allowLeaveRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Intercept in-app link clicks while dirty
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!dirty || allowLeaveRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (anchor.target === "_blank") return;
      // same-page hash only
      try {
        const url = new URL(href, window.location.origin);
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setLeavePrompt(href);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  async function confirmLeave(action: "save" | "discard" | "stay") {
    const href = leavePrompt;
    if (action === "stay") {
      setLeavePrompt(null);
      return;
    }
    if (action === "save") {
      const okSave = await saveAll();
      if (!okSave) return;
    }
    allowLeaveRef.current = true;
    setDirty(false);
    setLeavePrompt(null);
    if (href) {
      router.push(href);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={goBack}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-black/20 px-3 py-1.5 text-sm text-[color:var(--muted)] transition hover:border-[color:rgba(232,165,75,0.4)] hover:text-[color:var(--fg)]"
          >
            <span aria-hidden>←</span>
            Back
          </button>
          <h1 className="text-2xl font-semibold">AI Training</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {channelTitle
              ? `Settings for ${channelTitle}`
              : "Schedule, style, voice, and comments."}
            {dirty && (
              <span className="ml-2 text-[color:var(--accent)]">
                Unsaved changes
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !dirty}
          onClick={() => void saveAll({ goToChannel: true })}
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </header>

      <section id="schedule" className="scroll-mt-8">
        <ScheduleStudio value={schedule} onChange={onScheduleChange} />
      </section>

      <div className="space-y-6">
        <section className="panel rise space-y-5 p-6">
          <SectionTitle title="Content" subtitle="What kind of Shorts to make" />
          <div className="grid gap-5 sm:grid-cols-2">
            <PresetSelect
              label="Niche"
              value={form.niche}
              presets={ensurePreset(NICHE_PRESETS, form.niche)}
              onChange={(v) => setTraining("niche", v)}
            />
            <PresetSelect
              label="Content type"
              value={form.content_type}
              presets={ensurePreset(CONTENT_TYPE_PRESETS, form.content_type)}
              onChange={(v) => setTraining("content_type", v)}
            />
            <PresetSelect
              label="Format"
              value={form.video_format}
              presets={ensurePreset(VIDEO_FORMAT_PRESETS, form.video_format)}
              onChange={(v) => setTraining("video_format", v)}
            />
            <PresetSelect
              label="Edit style"
              value={form.video_style}
              presets={ensurePreset(VIDEO_STYLE_PRESETS, form.video_style)}
              onChange={(v) => setTraining("video_style", v)}
            />
            <PresetSelect
              label="Tone"
              value={form.tone}
              presets={ensurePreset(TONE_PRESETS, form.tone)}
              onChange={(v) => setTraining("tone", v)}
            />
            <PresetSelect
              label="Language"
              value={form.language}
              presets={ensurePreset(LANGUAGE_PRESETS, form.language)}
              onChange={(v) => setTraining("language", v)}
            />
            <PresetSelect
              label="Audience"
              value={form.target_audience}
              presets={ensurePreset(AUDIENCE_PRESETS, form.target_audience)}
              onChange={(v) => setTraining("target_audience", v)}
            />
            <PresetSelect
              label="Duration"
              value={String(form.duration_seconds)}
              presets={ensurePreset(
                DURATION_PRESETS,
                String(form.duration_seconds),
              )}
              onChange={(v) => setTraining("duration_seconds", Number(v))}
            />
            <PresetSelect
              label="Hook"
              value={form.hook_style}
              presets={ensurePreset(HOOK_PRESETS, form.hook_style)}
              onChange={(v) => setTraining("hook_style", v)}
            />
            <PresetSelect
              label="CTA"
              value={form.cta}
              presets={ensurePreset(CTA_PRESETS, form.cta)}
              onChange={(v) => setTraining("cta", v)}
            />
          </div>

          <div className="space-y-2 border-t border-[color:var(--line)] pt-5">
            <PresetSelect
              label="Script style"
              value={form.style_prompt}
              presets={ensurePreset(STYLE_PROMPT_PRESETS, form.style_prompt)}
              onChange={(v) => setTraining("style_prompt", v)}
              multiline
            />
          </div>
        </section>

        <section className="panel rise space-y-5 p-6">
          <SectionTitle
            title="Voice & media"
            subtitle="How it sounds and looks"
          />
          <VoicePicker
            value={form.voice_id}
            onChange={(v) => setTraining("voice_id", v)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <PresetSelect
              label="Subtitles"
              value={form.subtitle_style}
              presets={ensurePreset(SUBTITLE_PRESETS, form.subtitle_style)}
              onChange={(v) => setTraining("subtitle_style", v)}
            />
            <PresetSelect
              label="Music mood"
              value={form.music_mood}
              presets={ensurePreset(MUSIC_MOOD_PRESETS, form.music_mood)}
              onChange={(v) => setTraining("music_mood", v)}
            />
            <div className="sm:col-span-2">
              <PresetSelect
                label="B-roll (Pexels)"
                value={form.pexels_query}
                presets={ensurePreset(PEXELS_PRESETS, form.pexels_query)}
                onChange={(v) => setTraining("pexels_query", v)}
              />
            </div>
          </div>
        </section>

        <section className="panel rise space-y-5 p-6">
          <SectionTitle
            title="Brand rules"
            subtitle="What the AI must never do"
          />
          <PresetSelect
            label="Preset"
            value={form.brand_rules}
            presets={ensurePreset(BRAND_RULES_PRESETS, form.brand_rules)}
            onChange={(v) => setTraining("brand_rules", v)}
            multiline
          />
        </section>

        <section className="panel rise space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Comments</p>
            <button
              type="button"
              role="switch"
              aria-checked={form.reply_comments_enabled}
              onClick={() =>
                setTraining(
                  "reply_comments_enabled",
                  !form.reply_comments_enabled,
                )
              }
              className="relative h-7 w-12 shrink-0 rounded-full transition"
              style={{
                background: form.reply_comments_enabled
                  ? "rgba(232,165,75,0.85)"
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition"
                style={{
                  left: form.reply_comments_enabled ? "1.4rem" : "0.2rem",
                }}
              />
            </button>
          </div>

          {form.reply_comments_enabled && (
            <div className="grid gap-4 border-t border-[color:var(--line)] pt-4 sm:grid-cols-2">
              <PresetSelect
                label="Language"
                value={form.reply_languages}
                presets={ensurePreset(
                  [
                    { value: "auto", label: "Auto-detect" },
                    { value: "en", label: "English" },
                    { value: "ru", label: "Russian" },
                    { value: "de", label: "German" },
                    { value: "uz", label: "Uzbek" },
                  ],
                  form.reply_languages,
                )}
                onChange={(v) => setTraining("reply_languages", v)}
              />
              <div className="sm:col-span-2">
                <PresetSelect
                  label="AI style"
                  value={form.reply_style_prompt}
                  presets={ensurePreset(
                    REPLY_STYLE_PRESETS,
                    form.reply_style_prompt,
                  )}
                  onChange={(v) => setTraining("reply_style_prompt", v)}
                  multiline
                />
              </div>
            </div>
          )}
        </section>

        {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
        {ok && <p className="text-sm text-[color:var(--success)]">{ok}</p>}

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button
            type="button"
            className="btn btn-primary shadow-lg"
            disabled={busy || !dirty}
            onClick={() => void saveAll({ goToChannel: true })}
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {leavePrompt !== null && (
        <UnsavedCard
          busy={busy}
          onSave={() => void confirmLeave("save")}
          onStay={() => void confirmLeave("stay")}
          onDiscard={() => void confirmLeave("discard")}
        />
      )}
    </div>
  );
}

function UnsavedCard({
  busy,
  onSave,
  onStay,
  onDiscard,
}: {
  busy: boolean;
  onSave: () => void;
  onStay: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-4 sm:items-center"
      role="presentation"
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
      >
        <div>
          <h2 id="unsaved-title" className="text-lg font-semibold">
            Save changes?
          </h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            You changed settings but have not saved yet.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={busy}
            onClick={onStay}
          >
            Stay
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={busy}
            style={{ color: "var(--danger)" }}
            onClick={onDiscard}
          >
            Don&apos;t save
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={busy}
            onClick={onSave}
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-[color:var(--muted)]">{subtitle}</p>
    </div>
  );
}

function PresetSelect({
  label,
  value,
  presets,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  presets: Preset[];
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const inList = presets.some((p) => p.value === value);
  const [custom, setCustom] = useState(!inList);

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-[color:var(--muted)]">{label}</span>
      <select
        className="field text-[15px]"
        value={custom ? "__own__" : value}
        onChange={(e) => {
          if (e.target.value === "__own__") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
        required={!custom}
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value} title={p.label}>
            {p.label}
          </option>
        ))}
        <option value="__own__">+ Own</option>
      </select>
      {custom &&
        (multiline ? (
          <textarea
            className="field min-h-24 text-[15px] leading-relaxed"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            placeholder="Your value"
          />
        ) : (
          <input
            className="field text-[15px]"
            value={inList ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            required
            placeholder="Your value"
          />
        ))}
    </div>
  );
}
