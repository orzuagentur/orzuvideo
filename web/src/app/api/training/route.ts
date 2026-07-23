import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import { trainingRequiredComplete } from "@/lib/training-required";
import { SUBTITLE_STYLE_IDS } from "@/lib/editor-catalog";
import type { AiTraining } from "@/lib/types";

function normalizeSubtitleStyle(raw: string): string {
  const v = String(raw || "").trim();
  if (SUBTITLE_STYLE_IDS.has(v)) return v;
  if (v === "karaoke_bold" || v === "karaoke") return "karaoke_gold";
  return "classic";
}

function normalizeVideoFormat(raw: string): string {
  const v = raw.trim().toLowerCase() || "shorts";
  if (v === "video" || v === "long" || v === "longform" || v === "youtube_video") {
    return "video";
  }
  if (v === "simple" || v === "simple_video") return "simple";
  return "shorts";
}

function clampTrainingDuration(seconds: number, format: string): number {
  const fmt = normalizeVideoFormat(format);
  const n = Number.isFinite(seconds) ? Math.round(seconds) : 45;
  if (fmt === "video") return Math.min(600, Math.max(90, n));
  if (fmt === "simple") return Math.min(300, Math.max(60, n));
  return Math.min(59, Math.max(15, n));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveYoutubeChannel(user.id);
  if (!active?.channel_id) {
    return NextResponse.json(
      { error: "Select an active YouTube channel first" },
      { status: 400 },
    );
  }

  const body = await request.json();

  const formLike: AiTraining = {
    niche: String(body.niche || "").trim(),
    content_type: String(body.content_type || "").trim(),
    style_prompt: String(body.style_prompt || "").trim(),
    tone: String(body.tone || "").trim(),
    language: String(body.language || "").trim(),
    target_audience: String(body.target_audience || "").trim(),
    hook_style: String(body.hook_style || "").trim(),
    cta: String(body.cta || "").trim(),
    pexels_query: String(body.pexels_query || "").trim(),
    music_mood: String(body.music_mood || "").trim(),
    music_group: String(
      body.music_group || body.music_prefs?.active_group_id || "",
    ).trim(),
    music_prefs:
      body.music_prefs && typeof body.music_prefs === "object"
        ? body.music_prefs
        : undefined,
    voice_id: String(body.voice_id || "").trim(),
    subtitle_style: normalizeSubtitleStyle(String(body.subtitle_style || "classic")),
    duration_seconds: clampTrainingDuration(
      Number(body.duration_seconds) || 45,
      String(body.video_format || "shorts"),
    ),
    video_format: normalizeVideoFormat(String(body.video_format || "shorts")),
    video_style: String(body.video_style || "").trim(),
    reply_comments_enabled: Boolean(body.reply_comments_enabled),
    reply_languages: String(body.reply_languages || "auto").trim(),
    reply_style_prompt: String(body.reply_style_prompt || "").trim(),
    learning_enabled: false,
    brand_rules: String(body.brand_rules || "").trim(),
    is_trained: false,
  };

  if (!trainingRequiredComplete(formLike)) {
    return NextResponse.json(
      {
        error:
          "Fill required fields first: Language, Voice, and Niche",
      },
      { status: 400 },
    );
  }

  const enableAi = body.enable_ai === true;

  const payload = {
    user_id: user.id,
    youtube_channel_id: active.channel_id,
    niche: formLike.niche,
    content_type: formLike.content_type || "",
    style_prompt: formLike.style_prompt,
    tone: formLike.tone || "",
    language: formLike.language,
    target_audience: formLike.target_audience || "",
    hook_style: formLike.hook_style || "",
    cta: formLike.cta || "",
    // Empty optional → empty string; worker skips empties (no fake English defaults)
    pexels_query: formLike.pexels_query || "",
    music_mood: formLike.music_mood || "",
    music_group: String(body.music_group || body.music_prefs?.active_group_id || "").trim(),
    music_volume: Math.min(
      1,
      Math.max(0.15, Number(body.music_volume ?? body.music_prefs?.volume ?? 0.58) || 0.58),
    ),
    voice_volume: Math.min(
      1.4,
      Math.max(
        0.5,
        Number(body.voice_volume ?? body.music_prefs?.voice_volume ?? 1.05) ||
          1.05,
      ),
    ),
    music_prefs:
      body.music_prefs && typeof body.music_prefs === "object"
        ? body.music_prefs
        : {},
    voice_id: formLike.voice_id,
    subtitle_style: normalizeSubtitleStyle(formLike.subtitle_style || "classic"),
    duration_seconds: clampTrainingDuration(
      formLike.duration_seconds,
      formLike.video_format,
    ),
    video_format: normalizeVideoFormat(formLike.video_format || "shorts"),
    video_style: formLike.video_style || "",
    reply_comments_enabled: formLike.reply_comments_enabled,
    reply_languages: formLike.reply_languages,
    reply_style_prompt: formLike.reply_style_prompt || "",
    learning_enabled: false,
    brand_rules: formLike.brand_rules || "",
    is_trained: true,
  };

  const { data: existing } = await supabase
    .from("ai_training")
    .select("id")
    .eq("user_id", user.id)
    .eq("youtube_channel_id", active.channel_id)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from("ai_training")
      .update(payload)
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("ai_training").insert(payload));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // First-time "Enable AI content" flow — turn schedule on after required setup
  if (enableAi) {
    const { data: sched } = await supabase
      .from("publish_schedules")
      .select("id, times, videos_per_day, mode, weekdays, custom_dates, timezone")
      .eq("user_id", user.id)
      .eq("youtube_channel_id", active.channel_id)
      .maybeSingle();

    const scheduleRow = {
      user_id: user.id,
      youtube_channel_id: active.channel_id,
      enabled: true,
      mode: sched?.mode || "daily",
      videos_per_day: sched?.videos_per_day || 2,
      times: sched?.times || ["09:00", "18:00"],
      weekdays: sched?.weekdays || [1, 2, 3, 4, 5, 6, 7],
      custom_dates: sched?.custom_dates || [],
      timezone: sched?.timezone || "Europe/Berlin",
    };

    if (sched?.id) {
      await supabase
        .from("publish_schedules")
        .update({ enabled: true })
        .eq("id", sched.id);
    } else {
      await supabase.from("publish_schedules").insert(scheduleRow);
    }

    await supabase
      .from("profiles")
      .update({
        daily_videos_enabled: true,
        videos_per_day: scheduleRow.videos_per_day,
      })
      .eq("id", user.id);
  }

  return NextResponse.json({
    ok: true,
    youtube_channel_id: active.channel_id,
    ai_enabled: enableAi,
  });
}
