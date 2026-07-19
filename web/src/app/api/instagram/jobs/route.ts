import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type JobBody = {
  brief?: string;
  publish?: boolean;
  duration_seconds?: number;
  language?: string;
  tone?: string;
  voice_id?: string;
  heygen_avatar_id?: string;
  style_prompt?: string;
  hook_style?: string;
  cta?: string;
};

/** Queue a HeyGen Reel. Instagram Connect is ONLY required when publish=true. */
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
  const publish = body.publish === true;

  const [{ data: account }, { data: training }] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("connected")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("instagram_training").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const avatarId = String(
    body.heygen_avatar_id || training?.heygen_avatar_id || process.env.HEYGEN_AVATAR_ID || "",
  ).trim();

  if (!avatarId) {
    return NextResponse.json(
      {
        error:
          "Pick a HeyGen style in Instagram → Avatar first (or set HEYGEN_AVATAR_ID).",
      },
      { status: 400 },
    );
  }

  if (publish && !account?.connected) {
    return NextResponse.json(
      {
        error:
          "Connect Instagram only if you want auto-publish. For download-only, leave Publish off.",
      },
      { status: 400 },
    );
  }

  if (!brief || brief.length < 8) {
    return NextResponse.json(
      { error: "Write a brief for the Reel (at least a short idea)" },
      { status: 400 },
    );
  }

  // Soft-ensure training row so worker can run without a separate "Train" click
  if (!training) {
    await supabase.from("instagram_training").upsert(
      {
        user_id: user.id,
        heygen_avatar_id: avatarId,
        niche: "lifestyle",
        style_prompt:
          String(body.style_prompt || "").trim() ||
          "Friendly talking-head creator for Instagram Reels.",
        is_trained: true,
        voice_id: String(body.voice_id || "").trim() || "21m00Tcm4TlvDq8ikWAM",
        duration_seconds: Number(body.duration_seconds) || 30,
        language: String(body.language || "en"),
        tone: String(body.tone || "friendly"),
      },
      { onConflict: "user_id" },
    );
  } else if (!training.is_trained || !training.heygen_avatar_id) {
    await supabase
      .from("instagram_training")
      .update({
        is_trained: true,
        heygen_avatar_id: training.heygen_avatar_id || avatarId,
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
        publish,
        user_brief: brief,
        source: "instagram_content_studio",
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

  return NextResponse.json({ ok: true, job_id: data.id, publish });
}
