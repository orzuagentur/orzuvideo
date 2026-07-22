"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AiTraining, PublishSchedule } from "@/lib/types";
import {
  ScheduleStudio,
  normalizeSchedule,
  scheduleDefaults,
} from "@/components/ScheduleStudio";
import { VoicePicker } from "@/components/VoicePicker";
import { MusicTrainingStudio } from "@/components/MusicTrainingStudio";
import { useToast } from "@/components/ToastNotice";
import {
  AUDIENCE_PRESETS,
  BRAND_RULES_PRESETS,
  CONTENT_TYPE_PRESETS,
  CTA_PRESETS,
  defaultDurationForFormat,
  durationPresetsForFormat,
  HOOK_PRESETS,
  LANGUAGE_PRESETS,
  NICHE_PRESETS,
  PEXELS_PRESETS,
  REPLY_STYLE_PRESETS,
  STYLE_PROMPT_PRESETS,
  SUBTITLE_PRESETS,
  TONE_PRESETS,
  VIDEO_FORMAT_PRESETS,
  VIDEO_STYLE_PRESETS,
  ensurePreset,
  type Preset,
} from "@/lib/training-presets";
import {
  trainingChecklist,
  trainingEmptyDefaults,
  trainingRequiredComplete,
} from "@/lib/training-required";
import {
  clampMusicVolume,
  clampVoiceVolume,
  defaultMusicPrefs,
  type MusicPrefs,
} from "@/lib/music-groups";

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
  const searchParams = useSearchParams();
  const enableAiFlow = searchParams.get("enableAi") === "1";

  const [form, setForm] = useState<AiTraining>({
    ...trainingEmptyDefaults,
    ...initial,
    learning_enabled: false,
    music_prefs: {
      ...defaultMusicPrefs(),
      ...(initial?.music_prefs || {}),
      volume: clampMusicVolume(
        Number(initial?.music_volume ?? initial?.music_prefs?.volume ?? 0.58),
      ),
      voice_volume: clampVoiceVolume(
        Number(
          initial?.voice_volume ??
            initial?.music_prefs?.voice_volume ??
            1.05,
        ),
      ),
      active_group_id:
        initial?.music_group ||
        initial?.music_prefs?.active_group_id ||
        "",
    },
    music_group: initial?.music_group || initial?.music_prefs?.active_group_id || "",
    music_volume: clampMusicVolume(
      Number(initial?.music_volume ?? initial?.music_prefs?.volume ?? 0.58),
    ),
    voice_volume: clampVoiceVolume(
      Number(
        initial?.voice_volume ?? initial?.music_prefs?.voice_volume ?? 1.05,
      ),
    ),
  });
  const [schedule, setSchedule] = useState<PublishSchedule>(() =>
    normalizeSchedule({
      ...scheduleDefaults,
      ...scheduleInitial,
      // Schedule UI has no toggle; Channel controls on/off. Keep existing flag.
      enabled: scheduleInitial?.enabled ?? false,
    }),
  );
  const savedRef = useRef(snapshot(form, schedule));
  const { show: toast, notice } = useToast();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(enableAiFlow);
  const allowLeaveRef = useRef(false);

  const checklist = useMemo(() => trainingChecklist(form), [form]);
  const requiredOk = trainingRequiredComplete(form);
  const checklistDone = checklist.filter((c) => c.done).length;

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
    const normalized = normalizeSchedule({
      ...next,
      enabled: schedule.enabled,
    });
    setSchedule(normalized);
    markDirty(form, normalized);
  }

  async function saveAll(options?: {
    goToChannel?: boolean;
  }): Promise<boolean> {
    if (!requiredOk) {
      toast("Fill in the required fields first (checklist at bottom right).", "error");
      setChecklistOpen(true);
      return false;
    }

    setBusy(true);

    const schedulePayload = normalizeSchedule({
      ...schedule,
      enabled: enableAiFlow ? true : schedule.enabled,
    });
    const unique = new Set(schedulePayload.times);
    if (unique.size !== schedulePayload.times.length) {
      toast("Each publish time must be different.", "error");
      setBusy(false);
      return false;
    }

    const musicPrefs: MusicPrefs = {
      ...defaultMusicPrefs(),
      ...(form.music_prefs || {}),
      active_group_id: form.music_group || form.music_prefs?.active_group_id || "",
      volume: clampMusicVolume(Number(form.music_volume ?? form.music_prefs?.volume ?? 0.58)),
      voice_volume: clampVoiceVolume(
        Number(form.voice_volume ?? form.music_prefs?.voice_volume ?? 1.05),
      ),
    };

    const trainingBody = {
      ...form,
      learning_enabled: false,
      enable_ai: enableAiFlow || undefined,
      music_group: musicPrefs.active_group_id,
      music_volume: musicPrefs.volume,
      voice_volume: musicPrefs.voice_volume,
      music_mood: musicPrefs.active_group_id,
      music_prefs: musicPrefs,
    };

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
      toast(trainData.error || "Failed to save Training", "error");
      return false;
    }
    if (!schedRes.ok) {
      toast(schedData.error || "Failed to save schedule", "error");
      return false;
    }

    const savedSchedule = enableAiFlow
      ? { ...schedulePayload, enabled: true }
      : schedulePayload;
    savedRef.current = snapshot(
      { ...form, learning_enabled: false, is_trained: true },
      savedSchedule,
    );
    setForm((p) => ({ ...p, is_trained: true, learning_enabled: false }));
    setSchedule(savedSchedule);
    setDirty(false);
    toast(
      enableAiFlow
        ? "Saved. AI content enabled."
        : "Saved.",
    );
    if (options?.goToChannel || enableAiFlow) {
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

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty || allowLeaveRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!dirty || allowLeaveRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (anchor.target === "_blank") return;
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
    <div className="relative space-y-6 pb-24">
      {notice}
      <header className="sticky top-0 z-30 -mx-1 mb-2 flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line)] bg-[color:var(--bg)]/95 px-1 py-3 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={goBack}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-black/20 px-3 py-1.5 text-sm text-[color:var(--muted)] transition hover:border-[color:rgba(232,165,75,0.4)] hover:text-[color:var(--fg)]"
          >
            <span aria-hidden>←</span>
            Back
          </button>
          <h1 className="text-2xl font-semibold">AI Training</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {enableAiFlow
              ? "Fill required fields and press Save - AI content will turn on."
              : channelTitle
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
          className="btn btn-primary shrink-0"
          disabled={busy || (!dirty && !enableAiFlow) || !requiredOk}
          onClick={() => void saveAll({ goToChannel: true })}
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </header>

      {enableAiFlow && (
        <p className="rounded-xl border border-[color:rgba(232,165,75,0.35)] bg-[color:rgba(232,165,75,0.08)] px-4 py-3 text-sm">
          First AI content launch: check the items in the checklist (bottom right),
          then Save.
        </p>
      )}

      <section id="schedule" className="scroll-mt-8">
        <ScheduleStudio value={schedule} onChange={onScheduleChange} />
      </section>

      <div className="space-y-6">
        <section className="panel rise space-y-5 p-6">
          <SectionTitle
            title="Content"
            subtitle="Fill in the required fields. The rest can be left empty."
            required
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <PresetSelect
              label="Niche"
              value={form.niche}
              presets={ensurePreset(NICHE_PRESETS, form.niche)}
              onChange={(v) => setTraining("niche", v)}
              required
            />
            <PresetSelect
              label="Content type"
              value={form.content_type}
              presets={ensurePreset(CONTENT_TYPE_PRESETS, form.content_type)}
              onChange={(v) => setTraining("content_type", v)}
              optional
            />
            <PresetSelect
              label="Format"
              value={form.video_format}
              presets={ensurePreset(VIDEO_FORMAT_PRESETS, form.video_format)}
              onChange={(v) => {
                const next = { ...form, video_format: v };
                const allowed = durationPresetsForFormat(v).map((p) => p.value);
                if (!allowed.includes(String(form.duration_seconds))) {
                  next.duration_seconds = defaultDurationForFormat(v);
                }
                setForm(next);
              }}
            />
            <PresetSelect
              label="Edit style"
              value={form.video_style}
              presets={ensurePreset(VIDEO_STYLE_PRESETS, form.video_style)}
              onChange={(v) => setTraining("video_style", v)}
              optional
            />
            <PresetSelect
              label="Tone"
              value={form.tone}
              presets={ensurePreset(TONE_PRESETS, form.tone)}
              onChange={(v) => setTraining("tone", v)}
              optional
            />
            <PresetSelect
              label="Language"
              value={form.language}
              presets={ensurePreset(LANGUAGE_PRESETS, form.language)}
              onChange={(v) => setTraining("language", v)}
              required
            />
            <PresetSelect
              label="Audience"
              value={form.target_audience}
              presets={ensurePreset(AUDIENCE_PRESETS, form.target_audience)}
              onChange={(v) => setTraining("target_audience", v)}
              optional
            />
            <PresetSelect
              label="Duration"
              value={String(form.duration_seconds)}
              presets={ensurePreset(
                durationPresetsForFormat(form.video_format),
                String(form.duration_seconds),
              )}
              onChange={(v) => setTraining("duration_seconds", Number(v))}
            />
            <PresetSelect
              label="Hook"
              value={form.hook_style}
              presets={ensurePreset(HOOK_PRESETS, form.hook_style)}
              onChange={(v) => setTraining("hook_style", v)}
              optional
            />
            <PresetSelect
              label="CTA"
              value={form.cta}
              presets={ensurePreset(CTA_PRESETS, form.cta)}
              onChange={(v) => setTraining("cta", v)}
              optional
              hint="AI will translate the CTA into the selected language"
            />
          </div>

          <div className="space-y-2 border-t border-[color:var(--line)] pt-5">
            <PresetSelect
              label="Script style"
              value={form.style_prompt}
              presets={ensurePreset(STYLE_PROMPT_PRESETS, form.style_prompt)}
              onChange={(v) => setTraining("style_prompt", v)}
              multiline
              required
            />
          </div>
        </section>

        <section className="panel rise space-y-5 p-6">
          <SectionTitle title="Voice" required />
          <VoicePicker
            value={form.voice_id}
            onChange={(v) => setTraining("voice_id", v)}
          />
          <div className="grid gap-5 border-t border-[color:var(--line)] pt-5 sm:grid-cols-2">
            <PresetSelect
              label="Subtitles"
              value={form.subtitle_style}
              presets={ensurePreset(SUBTITLE_PRESETS, form.subtitle_style)}
              onChange={(v) => setTraining("subtitle_style", v)}
              optional
            />
            <div className="sm:col-span-2">
              <PresetSelect
                label="B-roll"
                value={form.pexels_query}
                presets={ensurePreset(PEXELS_PRESETS, form.pexels_query)}
                onChange={(v) => setTraining("pexels_query", v)}
                optional
              />
            </div>
          </div>
        </section>

        <MusicTrainingStudio
          voiceId={form.voice_id}
          required
          value={{
            ...defaultMusicPrefs(),
            ...(form.music_prefs || {}),
            active_group_id:
              form.music_group || form.music_prefs?.active_group_id || "",
            volume: clampMusicVolume(
              Number(form.music_volume ?? form.music_prefs?.volume ?? 0.58),
            ),
            voice_volume: clampVoiceVolume(
              Number(
                form.voice_volume ?? form.music_prefs?.voice_volume ?? 1.05,
              ),
            ),
          }}
          onChange={(next) => {
            setForm((prev) => {
              const updated = {
                ...prev,
                music_group: next.active_group_id,
                music_volume: next.volume,
                voice_volume: next.voice_volume,
                music_mood: next.active_group_id,
                music_prefs: next,
              };
              markDirty(updated, schedule);
              return updated;
            });
          }}
        />

        <section className="panel rise space-y-5 p-6">
          <SectionTitle
            title="Brand rules"
            subtitle="Optional - can be left empty"
          />
          <PresetSelect
            label="Preset"
            value={form.brand_rules}
            presets={ensurePreset(BRAND_RULES_PRESETS, form.brand_rules)}
            onChange={(v) => setTraining("brand_rules", v)}
            multiline
            optional
          />
        </section>

        <section className="panel rise space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Comments</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                When on, the worker reads new comments and AI-replies. You can also
                reply from each video in Channel. YouTube API cannot like/heart
                comments — only replies.
              </p>
            </div>
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
                  optional
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Floating checklist FAB — bottom right */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
        {checklistOpen && (
          <div
            className="w-[min(100vw-2.5rem,280px)] rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]/95 p-4 shadow-2xl backdrop-blur-md"
            role="dialog"
            aria-label="Required checklist"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Required</p>
              <span className="text-xs tabular-nums text-[color:var(--muted)]">
                {checklistDone}/{checklist.length}
              </span>
            </div>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                    style={{
                      background: item.done
                        ? "rgba(74,222,128,0.2)"
                        : "rgba(255,255,255,0.06)",
                      color: item.done ? "var(--success)" : "var(--muted)",
                      border: `1px solid ${
                        item.done
                          ? "rgba(74,222,128,0.45)"
                          : "var(--line)"
                      }`,
                    }}
                  >
                    {item.done ? "✓" : ""}
                  </span>
                  <span
                    style={{
                      color: item.done ? "var(--fg)" : "var(--muted)",
                    }}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-[color:var(--muted)]">
              Optional fields can be left empty. AI texts will be in
              the selected Language.
            </p>
          </div>
        )}
        <button
          type="button"
          aria-label="Required checklist"
          aria-expanded={checklistOpen}
          onClick={() => setChecklistOpen((v) => !v)}
          className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition hover:scale-105"
          style={{
            background: requiredOk
              ? "linear-gradient(135deg, var(--accent-dim), var(--accent))"
              : "rgba(232,165,75,0.25)",
            border: "1px solid rgba(232,165,75,0.55)",
            color: requiredOk ? "#1a1208" : "var(--accent)",
          }}
        >
          <span className="font-[family-name:var(--font-syne)] text-sm font-bold tabular-nums">
            {checklistDone}/{checklist.length}
          </span>
        </button>
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

function SectionTitle({
  title,
  subtitle,
  required = false,
}: {
  title: string;
  subtitle?: string;
  required?: boolean;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">
        {title}
        {required ? (
          <span className="ml-1" style={{ color: "var(--accent)" }} aria-hidden>
            *
          </span>
        ) : null}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-[color:var(--muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}

function PresetSelect({
  label,
  value,
  presets,
  onChange,
  multiline = false,
  optional = false,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  presets: Preset[];
  onChange: (v: string) => void;
  multiline?: boolean;
  optional?: boolean;
  required?: boolean;
  hint?: string;
}) {
  const empty = !value;
  const inList = !empty && presets.some((p) => p.value === value);
  const [custom, setCustom] = useState(!empty && !inList);

  useEffect(() => {
    if (empty) setCustom(false);
  }, [empty]);

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-[color:var(--muted)]">
        {label}
        {required ? (
          <span className="ml-1" style={{ color: "var(--accent)" }} aria-hidden>
            *
          </span>
        ) : null}
        {optional && !required ? (
          <span className="ml-1 font-normal opacity-70">(optional)</span>
        ) : null}
      </span>
      <select
        className="field text-[15px]"
        value={custom ? "__own__" : empty ? "" : value}
        onChange={(e) => {
          if (e.target.value === "__own__") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {(optional || !required) && (
          <option value="">— Not set —</option>
        )}
        {required && empty && <option value="">— Choose —</option>}
        {presets.map((p) => (
          <option key={p.value} value={p.value} title={p.label}>
            {p.label}
          </option>
        ))}
        <option value="__own__">+ Own</option>
      </select>
      {hint && (
        <p className="text-[11px] text-[color:var(--muted)]">{hint}</p>
      )}
      {custom &&
        (multiline ? (
          <textarea
            className="field min-h-24 text-[15px] leading-relaxed"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your value"
          />
        ) : (
          <input
            className="field text-[15px]"
            value={inList ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your value"
          />
        ))}
    </div>
  );
}
