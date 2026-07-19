import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

function weekdayMon1(d: Date): number {
  // JS: 0=Sun ... convert to 1=Mon ... 7=Sun
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function todayInTz(timezone: string): { dateStr: string; weekday: number; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour}:${parts.minute}`;
  const weekday = weekdayMon1(
    new Date(`${dateStr}T${hhmm}:00`),
  );
  return { dateStr, weekday, hhmm };
}

/**
 * Vercel Cron (hourly): create jobs based on publish_schedules / legacy flags.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  let created = 0;

  const { data: schedules } = await sb
    .from("publish_schedules")
    .select("*")
    .eq("enabled", true);

  for (const schedule of schedules || []) {
    const { data: profile } = await sb
      .from("profiles")
      .select("id, youtube_connected")
      .eq("id", schedule.user_id)
      .maybeSingle();
    if (!profile?.youtube_connected) continue;

    const { data: training } = await sb
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", schedule.user_id)
      .eq("is_trained", true)
      .maybeSingle();
    if (!training) continue;

    const tz = schedule.timezone || "UTC";
    const { dateStr, weekday, hhmm } = todayInTz(tz);
    const times: string[] = schedule.times || [];
    const matchedTime = times.find((t) => {
      const [h, m] = String(t).split(":");
      return hhmm === `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
    });
    if (!matchedTime) continue;

    let allowed = false;
    if (schedule.mode === "daily") allowed = true;
    if (schedule.mode === "weekdays") allowed = weekday >= 1 && weekday <= 5;
    if (schedule.mode === "custom_days") {
      allowed = (schedule.weekdays || []).includes(weekday);
    }
    if (schedule.mode === "dates") {
      allowed = (schedule.custom_dates || []).includes(dateStr);
    }
    if (!allowed) continue;

    // Avoid duplicate queue for same slot
    const slotKey = `${dateStr}T${matchedTime}`;
    const { data: existing } = await sb
      .from("video_jobs")
      .select("id")
      .eq("user_id", schedule.user_id)
      .contains("metadata", { schedule_slot: slotKey })
      .limit(1);
    if (existing && existing.length) continue;

    const count = schedule.videos_per_day || 1;
    const rows = Array.from({ length: count }, (_, i) => ({
      user_id: schedule.user_id,
      status: "queued" as const,
      scheduled_for: new Date(Date.now() + i * 20 * 60 * 1000).toISOString(),
      metadata: { schedule_slot: slotKey, schedule_time: matchedTime },
    }));
    const { error } = await sb.from("video_jobs").insert(rows);
    if (!error) created += rows.length;
  }

  // Legacy fallback: daily_videos_enabled without schedule row
  const { data: legacy } = await sb
    .from("profiles")
    .select("id, videos_per_day")
    .eq("daily_videos_enabled", true)
    .eq("youtube_connected", true);

  for (const user of legacy || []) {
    const { data: sched } = await sb
      .from("publish_schedules")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sched) continue;

    const { data: training } = await sb
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", user.id)
      .eq("is_trained", true)
      .maybeSingle();
    if (!training) continue;

    const count = user.videos_per_day || 2;
    const rows = Array.from({ length: count }, (_, i) => ({
      user_id: user.id,
      status: "queued" as const,
      scheduled_for: new Date(Date.now() + i * 30 * 60 * 1000).toISOString(),
    }));
    const { error } = await sb.from("video_jobs").insert(rows);
    if (!error) created += rows.length;
  }

  return NextResponse.json({ ok: true, created });
}
