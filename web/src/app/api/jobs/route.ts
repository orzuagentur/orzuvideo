import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { brief?: string; publish?: boolean } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const brief = String(body.brief || "").trim();
  // Default true keeps dashboard / cron auto-publish behavior
  const publish = body.publish !== false;

  const [{ data: profile }, { data: training }] = await Promise.all([
    supabase.from("profiles").select("youtube_connected").eq("id", user.id).single(),
    supabase
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!training?.is_trained) {
    return NextResponse.json({ error: "Train the AI first" }, { status: 400 });
  }
  if (publish && !profile?.youtube_connected) {
    return NextResponse.json({ error: "Connect YouTube first" }, { status: 400 });
  }
  if (!brief && !publish) {
    return NextResponse.json(
      { error: "Write a short brief about the video first" },
      { status: 400 },
    );
  }

  const metadata: Record<string, unknown> = {
    publish,
    source: publish ? "dashboard" : "content_plus",
  };
  if (brief) metadata.user_brief = brief;

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: user.id,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    job_id: data.id,
    publish,
  });
}
