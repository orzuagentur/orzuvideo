import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

function weekdayMon1(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function todayInTz(timezone: string): {
  dateStr: string;
  weekday: number;
  hhmm: string;
} {
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
  // Intl can return "24" for midnight in some environments — normalize to 00
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const hhmm = `${hour}:${parts.minute}`;
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

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron always sends this header on scheduled invocations
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) return true;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Hourly cron: ONE job per matched clock hour.
 * videos_per_day=3 + times [09:00,14:00,20:00] → three separate publishes.
 *
 * Pipeline:
 * 1) This route only INSERTS queued video_jobs (needs Schedule ON + trained + YT connected)
 * 2) Python worker must be running to render + upload
 * Web logout does NOT stop this — uses service role, not the browser session.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  let created = 0;
  let skipped = 0;
  const reasons: string[] = [];

  const { data: schedules } = await sb
    .from("publish_schedules")
    .select("*")
    .eq("enabled", true);

  for (const schedule of schedules || []) {
    const { data: profile } = await sb
      .from("profiles")
      .select("id, youtube_connected, youtube_refresh_token")
      .eq("id", schedule.user_id)
      .maybeSingle();

    if (!profile?.youtube_connected) {
      skipped += 1;
      reasons.push(`${schedule.user_id}: youtube not connected`);
      continue;
    }

    // Prefer channel-scoped training; fall back to any trained row for this user
    let trainingOk = false;
    if (schedule.youtube_channel_id) {
      const { data: chTrain } = await sb
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", schedule.user_id)
        .eq("youtube_channel_id", schedule.youtube_channel_id)
        .eq("is_trained", true)
        .limit(1)
        .maybeSingle();
      trainingOk = Boolean(chTrain?.is_trained);
    }
    if (!trainingOk) {
      const { data: anyTrain } = await sb
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", schedule.user_id)
        .eq("is_trained", true)
        .limit(1)
        .maybeSingle();
      trainingOk = Boolean(anyTrain?.is_trained);
    }
    if (!trainingOk) {
      skipped += 1;
      reasons.push(`${schedule.user_id}: AI Training not completed`);
      continue;
    }

    const tz = schedule.timezone || "UTC";
    const { dateStr, weekday, hhmm } = todayInTz(tz);
    const times = normalizeTimes(schedule.times || []);
    const perDay = Math.min(
      10,
      Math.max(1, Number(schedule.videos_per_day) || 1),
    );
    const activeTimes = times.slice(0, perDay);

    // Match the scheduled slot whose hour equals the current hour in the schedule TZ
    const matchedTime = activeTimes.find((t) => {
      const [th] = t.split(":");
      const [ch] = hhmm.split(":");
      return String(th).padStart(2, "0") === String(ch).padStart(2, "0");
    });
    if (!matchedTime) {
      skipped += 1;
      continue;
    }
    if (!dayAllowed(schedule, weekday, dateStr)) {
      skipped += 1;
      reasons.push(`${schedule.user_id}: day not allowed (${schedule.mode})`);
      continue;
    }

    const slotKey = `${dateStr}T${matchedTime}`;
    const { data: existing } = await sb
      .from("video_jobs")
      .select("id")
      .eq("user_id", schedule.user_id)
      .contains("metadata", { schedule_slot: slotKey })
      .limit(1);
    if (existing && existing.length) {
      skipped += 1;
      continue;
    }

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
        source: "schedule",
        pipeline: "youtube",
        publish: true,
      },
    });
    if (!error) created += 1;
    else reasons.push(`${schedule.user_id}: insert failed ${error.message}`);
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
      .limit(1)
      .maybeSingle();
    if (sched) continue;

    const { data: training } = await sb
      .from("ai_training")
      .select("is_trained")
      .eq("user_id", user.id)
      .eq("is_trained", true)
      .limit(1)
      .maybeSingle();
    if (!training) continue;

    const count = Math.min(10, Math.max(1, user.videos_per_day || 2));
    const rows = Array.from({ length: count }, (_, i) => ({
      user_id: user.id,
      status: "queued" as const,
      scheduled_for: new Date(Date.now() + i * 4 * 60 * 60 * 1000).toISOString(),
      metadata: {
        schedule_slot: `legacy-${new Date().toISOString().slice(0, 10)}-${i}`,
        source: "schedule_legacy",
        publish: true,
      },
    }));
    const { error } = await sb.from("video_jobs").insert(rows);
    if (!error) created += rows.length;
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    reasons: reasons.slice(0, 20),
  });
}
