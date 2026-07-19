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

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.daily_videos_enabled === "boolean") {
    updates.daily_videos_enabled = body.daily_videos_enabled;
  }
  if (typeof body.videos_per_day === "number") {
    updates.videos_per_day = Math.min(5, Math.max(1, body.videos_per_day));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (updates.daily_videos_enabled === true) {
    const [{ data: profile }, { data: training }] = await Promise.all([
      supabase
        .from("profiles")
        .select("youtube_connected")
        .eq("id", user.id)
        .single(),
      supabase
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (!profile?.youtube_connected) {
      return NextResponse.json(
        { error: "Connect YouTube first" },
        { status: 400 },
      );
    }
    if (!training?.is_trained) {
      return NextResponse.json(
        { error: "Train the AI first" },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
