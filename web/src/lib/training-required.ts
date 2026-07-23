import type { AiTraining } from "@/lib/types";

/** Required before AI content can run / first-time enable. */
export const TRAINING_REQUIRED = [
  { key: "language" as const, label: "Language" },
  { key: "voice_id" as const, label: "Voice" },
  { key: "niche" as const, label: "Niche" },
] as const;

/** Optional text fields — empty = omit from worker prompt. */
export const TRAINING_OPTIONAL_TEXT = [
  "content_type",
  "tone",
  "target_audience",
  "hook_style",
  "cta",
  "brand_rules",
  "pexels_query",
  "music_mood",
  "video_style",
  "style_prompt",
  "reply_style_prompt",
] as const;

export type TrainingRequiredKey = (typeof TRAINING_REQUIRED)[number]["key"];

export function trainingFieldFilled(
  form: Pick<AiTraining, "language" | "voice_id" | "niche">,
  key: TrainingRequiredKey,
): boolean {
  const v = form[key];
  return typeof v === "string" && v.trim().length > 0;
}

export function trainingChecklist(form: AiTraining) {
  return TRAINING_REQUIRED.map((item) => ({
    ...item,
    done: trainingFieldFilled(form, item.key),
  }));
}

export function trainingRequiredComplete(form: AiTraining): boolean {
  return TRAINING_REQUIRED.every((item) => trainingFieldFilled(form, item.key));
}

/** Empty-friendly defaults for new channels (required fields start blank). */
export const trainingEmptyDefaults: AiTraining = {
  niche: "",
  content_type: "",
  style_prompt: "",
  tone: "",
  language: "",
  target_audience: "",
  hook_style: "",
  cta: "",
  pexels_query: "",
  music_mood: "",
  music_group: "",
  music_volume: 0.58,
  voice_volume: 1.05,
  music_prefs: {
    active_group_id: "",
    volume: 0.58,
    voice_volume: 1.05,
    selected_track_ids: [],
    custom_groups: [],
  },
  voice_id: "",
  subtitle_style: "classic",
  duration_seconds: 45,
  video_format: "shorts",
  video_style: "",
  reply_comments_enabled: false,
  reply_languages: "auto",
  reply_style_prompt: "",
  learning_enabled: false,
  brand_rules: "",
  is_trained: false,
};
