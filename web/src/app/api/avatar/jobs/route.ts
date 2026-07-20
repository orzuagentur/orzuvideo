import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type JobBody = {
  brief?: string;
  duration_seconds?: number;
  language?: string;
  tone?: string;
  voice_id?: string;
  heygen_avatar_id?: string;
  style_prompt?: string;
  hook_style?: string;
  cta?: string;
};

/** Queue a HeyGen avatar video (download-only — no social publish). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: JobBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const brief = String(body.brief || "").trim();
  const { data: training } = await supabase
    .from("instagram_training")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const avatarId = String(
    body.heygen_avatar_id || training?.heygen_avatar_id || process.env.HEYGEN_AVATAR_ID || "",
  ).trim();

  if (!avatarId) {
    return NextResponse.json(
      { error: "Pick a HeyGen style in Avatar first (or set HEYGEN_AVATAR_ID)." },
      { status: 400 },
    );
  }

  if (!brief || brief.length < 8) {
    return NextResponse.json(
      { error: "Write a brief for the video (at least a short idea)" },
      { status: 400 },
    );
  }

  if (!training) {
    await supabase.from("instagram_training").upsert(
      {
        user_id: user.id,
        heygen_avatar_id: avatarId,
        niche: "avatar",
        style_prompt:
          String(body.style_prompt || "").trim() ||
          "Friendly talking-head creator for vertical video.",
        is_trained: true,
        voice_id: String(body.voice_id || "").trim() || "21m00Tcm4TlvDq8ikWAM",
        duration_seconds: Number(body.duration_seconds) || 30,
        language: String(body.language || "en"),
        tone: String(body.tone || "friendly"),
        visual_mode: "heygen",
      },
      { onConflict: "user_id" },
    );
  } else if (!training.is_trained || !training.heygen_avatar_id) {
    await supabase
      .from("instagram_training")
      .update({
        is_trained: true,
        heygen_avatar_id: training.heygen_avatar_id || avatarId,
        visual_mode: "heygen",
      })
      .eq("user_id", user.id);
  }

  const duration = Math.min(
    90,
    Math.max(15, Number(body.duration_seconds) || training?.duration_seconds || 30),
  );

  const { data, error } = await supabase
    .from("instagram_jobs")
    .insert({
      user_id: user.id,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      metadata: {
        publish: false,
        user_brief: brief,
        source: "avatar_studio",
        heygen_avatar_id: avatarId,
        duration_seconds: duration,
        language: String(body.language || training?.language || "en").trim(),
        tone: String(body.tone || training?.tone || "friendly").trim(),
        voice_id: String(
          body.voice_id || training?.voice_id || "21m00Tcm4TlvDq8ikWAM",
        ).trim(),
        style_prompt: String(body.style_prompt || training?.style_prompt || "").trim(),
        hook_style: String(body.hook_style || training?.hook_style || "").trim(),
        cta: String(body.cta || training?.cta || "").trim(),
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: data.id });
}
