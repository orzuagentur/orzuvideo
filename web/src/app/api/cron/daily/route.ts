import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

function weekdayMon1(d: Date): number {
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
  const weekday = weekdayMon1(new Date(`${dateStr}T${hhmm}:00`));
  return { dateStr, weekday, hhmm };
}

function normalizeTimes(times: string[]): string[] {
  return times
    .map((t) => {
      const [h, m] = String(t).trim().split(":");
      if (h == null) return "";
      return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
    })
    .filter(Boolean);
}

function dayAllowed(
  schedule: {
    mode?: string;
    weekdays?: number[];
    custom_dates?: string[];
  },
  weekday: number,
  dateStr: string,
): boolean {
  if (schedule.mode === "daily") return true;
  if (schedule.mode === "weekdays") return weekday >= 1 && weekday <= 5;
  if (schedule.mode === "custom_days") {
    return (schedule.weekdays || []).includes(weekday);
  }
  if (schedule.mode === "dates") {
    return (schedule.custom_dates || []).includes(dateStr);
  }
  return true;
}

/**
 * Hourly cron: ONE job per matched clock time.
 * videos_per_day=3 + times [09:00,14:00,20:00] → three separate publishes, not a batch.
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
    const times = normalizeTimes(schedule.times || []);
    const perDay = Math.min(10, Math.max(1, Number(schedule.videos_per_day) || 1));
    const activeTimes = times.slice(0, perDay);

    const matchedTime = activeTimes.find((t) => {
      // Hourly Vercel cron: match any scheduled minute within the current hour
      const [th] = t.split(":");
      const [ch] = hhmm.split(":");
      return String(th).padStart(2, "0") === String(ch).padStart(2, "0");
    });
    if (!matchedTime) continue;
    if (!dayAllowed(schedule, weekday, dateStr)) continue;

    const slotKey = `${dateStr}T${matchedTime}`;
    const { data: existing } = await sb
      .from("video_jobs")
      .select("id")
      .eq("user_id", schedule.user_id)
      .contains("metadata", { schedule_slot: slotKey })
      .limit(1);
    if (existing && existing.length) continue;

    const { error } = await sb.from("video_jobs").insert({
      user_id: schedule.user_id,
      youtube_channel_id: schedule.youtube_channel_id || null,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      metadata: {
        schedule_slot: slotKey,
        schedule_time: matchedTime,
        videos_per_day: perDay,
        youtube_channel_id: schedule.youtube_channel_id || null,
      },
    });
    if (!error) created += 1;
  }

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

    const count = Math.min(10, Math.max(1, user.videos_per_day || 2));
    const rows = Array.from({ length: count }, (_, i) => ({
      user_id: user.id,
      status: "queued" as const,
      scheduled_for: new Date(Date.now() + i * 4 * 60 * 60 * 1000).toISOString(),
      metadata: {
        schedule_slot: `legacy-${new Date().toISOString().slice(0, 10)}-${i}`,
      },
    }));
    const { error } = await sb.from("video_jobs").insert(rows);
    if (!error) created += rows.length;
  }

  return NextResponse.json({ ok: true, created });
}
