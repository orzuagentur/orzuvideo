import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const style_prompt = String(body.style_prompt || "").trim();
  const niche = String(body.niche || "").trim();
  if (!style_prompt || !niche) {
    return NextResponse.json(
      { error: "niche and style_prompt are required" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("instagram_training")
    .select("heygen_avatar_id, heygen_avatar_name, visual_mode, heygen_background_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    niche,
    content_type: String(body.content_type || "reels_talking_head"),
    style_prompt,
    tone: String(body.tone || "friendly"),
    language: String(body.language || "en"),
    target_audience: String(body.target_audience || ""),
    hook_style: String(body.hook_style || ""),
    cta: String(body.cta || ""),
    music_mood: String(body.music_mood || "upbeat"),
    voice_id: String(body.voice_id || "21m00Tcm4TlvDq8ikWAM"),
    duration_seconds: Math.min(90, Math.max(15, Number(body.duration_seconds) || 30)),
    brand_rules: String(body.brand_rules || ""),
    is_trained: true,
    heygen_avatar_id: existing?.heygen_avatar_id || null,
    heygen_avatar_name: existing?.heygen_avatar_name || null,
    visual_mode: existing?.visual_mode || "heygen",
    heygen_background_mode: existing?.heygen_background_mode || "rotate",
  };

  const { error } = await supabase
    .from("instagram_training")
    .upsert(payload, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
