import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

/**
 * Vercel Cron: schedule N Shorts/day for users with autopilot enabled.
 * Protect with CRON_SECRET header.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: users, error } = await sb
    .from("profiles")
    .select("id, videos_per_day")
    .eq("daily_videos_enabled", true)
    .eq("youtube_connected", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let created = 0;
  const now = new Date();

  for (const user of users || []) {
    const { data: training } = await sb
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", user.id)
      .eq("is_trained", true)
      .maybeSingle();

    if (!training) continue;

    const count = user.videos_per_day || 2;
    const rows = Array.from({ length: count }, (_, i) => {
      const scheduled = new Date(now.getTime() + i * 30 * 60 * 1000);
      return {
        user_id: user.id,
        status: "queued" as const,
        scheduled_for: scheduled.toISOString(),
      };
    });

    const { error: insertError } = await sb.from("video_jobs").insert(rows);
    if (!insertError) created += rows.length;
  }

  return NextResponse.json({ ok: true, created });
}
