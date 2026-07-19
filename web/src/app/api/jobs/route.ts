import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, { data: training }] = await Promise.all([
    supabase.from("profiles").select("youtube_connected").eq("id", user.id).single(),
    supabase
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile?.youtube_connected) {
    return NextResponse.json({ error: "Connect YouTube first" }, { status: 400 });
  }
  if (!training?.is_trained) {
    return NextResponse.json({ error: "Train the AI first" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: user.id,
      status: "queued",
      scheduled_for: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: data.id });
}
