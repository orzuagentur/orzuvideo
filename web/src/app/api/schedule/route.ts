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
    enabled: Boolean(body.enabled),
    mode: String(body.mode || "daily"),
    videos_per_day: Math.min(10, Math.max(1, Number(body.videos_per_day) || 2)),
    times: Array.isArray(body.times) ? body.times.map(String) : ["09:00", "18:00"],
    weekdays: Array.isArray(body.weekdays)
      ? body.weekdays.map(Number)
      : [1, 2, 3, 4, 5, 6, 7],
    custom_dates: Array.isArray(body.custom_dates)
      ? body.custom_dates.map(String)
      : [],
    timezone: String(body.timezone || "Europe/Berlin"),
  };

  if (!["daily", "weekdays", "custom_days", "dates"].includes(payload.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const { error } = await supabase.from("publish_schedules").upsert(payload, {
    onConflict: "user_id",
  });

  // Keep legacy flag in sync for existing cron
  await supabase
    .from("profiles")
    .update({
      daily_videos_enabled: payload.enabled,
      videos_per_day: payload.videos_per_day,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
