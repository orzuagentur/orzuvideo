import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { brief?: string; publish?: boolean } = {};
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
    supabase
      .from("instagram_training")
      .select("is_trained, heygen_avatar_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!training?.is_trained) {
    return NextResponse.json({ error: "Train Instagram AI first" }, { status: 400 });
  }
  if (!training.heygen_avatar_id) {
    return NextResponse.json(
      { error: "Save HeyGen Avatar ID in Instagram → Avatar" },
      { status: 400 },
    );
  }
  if (publish && !account?.connected) {
    return NextResponse.json(
      { error: "Connect Instagram account first" },
      { status: 400 },
    );
  }
  if (!brief) {
    return NextResponse.json(
      { error: "Write a short brief for the Reel" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("instagram_jobs")
    .insert({
      user_id: user.id,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      metadata: {
        publish,
        user_brief: brief,
        source: "instagram_content_plus",
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: data.id, publish });
}
