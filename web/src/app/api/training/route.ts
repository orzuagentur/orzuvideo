import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const payload = {
    user_id: user.id,
    niche: String(body.niche || "").trim(),
    content_type: String(body.content_type || "").trim(),
    style_prompt: String(body.style_prompt || "").trim(),
    tone: String(body.tone || "powerful"),
    language: String(body.language || "en"),
    target_audience: String(body.target_audience || ""),
    hook_style: String(body.hook_style || ""),
    cta: String(body.cta || ""),
    pexels_query: String(body.pexels_query || "cinematic man"),
    music_mood: String(body.music_mood || "cinematic"),
    voice_id: String(body.voice_id || "21m00Tcm4TlvDq8ikWAM"),
    subtitle_style: String(body.subtitle_style || "karaoke_bold"),
    duration_seconds: Math.min(59, Math.max(20, Number(body.duration_seconds) || 45)),
    video_format: String(body.video_format || "shorts"),
    video_style: String(body.video_style || "cinematic_mixer"),
    reply_comments_enabled: Boolean(body.reply_comments_enabled),
    reply_languages: String(body.reply_languages || "auto"),
    reply_style_prompt: String(body.reply_style_prompt || ""),
    learning_enabled: body.learning_enabled !== false,
    brand_rules: String(body.brand_rules || ""),
    is_trained: true,
  };

  if (!payload.style_prompt || !payload.niche) {
    return NextResponse.json(
      { error: "niche and style_prompt are required" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("ai_training").upsert(payload, {
    onConflict: "user_id",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
