import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  requeueFailedJobs,
  requeueStuckJobs,
} from "@/lib/requeue-failed-jobs";

export const runtime = "nodejs";

function weekdayMon1(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function todayInTz(timezone: string): {
  dateStr: string;
  weekday: number;
  hhmm: string;
  minutesOfDay: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  // Intl can return "24" for midnight — treat as 00:00 next calendar day edge
  let hour = parts.hour === "24" ? "00" : parts.hour;
  if (parts.hour === "24") {
    // Keep calendar date from formatter; hour normalized to 00
    hour = "00";
  }
  const minute = parts.minute || "00";
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const minutesOfDay =
    Number(hour) * 60 + Number(minute);

  const wdMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekday = wdMap[parts.weekday || ""] || weekdayMon1(new Date(`${dateStr}T12:00:00Z`));
  return { dateStr, weekday, hhmm, minutesOfDay };
}

function slotMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(":");
  return Number(h || 0) * 60 + Number(m || 0);
}

/**
 * Match schedule slots in the user's timezone.
 * Cron runs every 15 minutes — fire when "now" has reached the slot
 * and is still within a 15-minute window (dedupe prevents doubles).
 */
function matchScheduleSlot(
  activeTimes: string[],
  minutesOfDay: number,
): string | null {
  const WINDOW = 15;
  for (const t of activeTimes) {
    const slot = slotMinutes(t);
    if (minutesOfDay >= slot && minutesOfDay < slot + WINDOW) {
      return t;
    }
  }
  return null;
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
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Every 15 minutes:
 * 0) Auto-repair: requeue failed jobs (+ stuck mid-pipeline jobs)
 * 1) INSERT queued video_jobs for matched schedule slots (Schedule ON + trained + YT)
 * 2) Python worker renders + uploads
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

  // Auto-repair failed / stuck jobs before enqueueing new schedule slots
  const failedRepair = await requeueFailedJobs(sb);
  const stuckRepair = await requeueStuckJobs(sb);
  if (failedRepair.requeued) {
    console.log(
      `[RETRY] cron requeued ${failedRepair.requeued} failed job(s)`,
      failedRepair.ids,
    );
  }
  if (stuckRepair.requeued) {
    console.log(
      `[RETRY] cron requeued ${stuckRepair.requeued} stuck job(s)`,
      stuckRepair.ids,
    );
  }

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
    let dateStr: string;
    let weekday: number;
    let minutesOfDay: number;
    try {
      const nowTz = todayInTz(tz);
      dateStr = nowTz.dateStr;
      weekday = nowTz.weekday;
      minutesOfDay = nowTz.minutesOfDay;
    } catch {
      skipped += 1;
      reasons.push(`${schedule.user_id}: invalid timezone ${tz}`);
      continue;
    }

    const times = normalizeTimes(schedule.times || []);
    const perDay = Math.min(
      10,
      Math.max(1, Number(schedule.videos_per_day) || 1),
    );
    const activeTimes = times.slice(0, perDay);

    const matchedTime = matchScheduleSlot(activeTimes, minutesOfDay);
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
    let existingQuery = sb
      .from("video_jobs")
      .select("id")
      .eq("user_id", schedule.user_id)
      .contains("metadata", { schedule_slot: slotKey })
      .limit(1);
    existingQuery = schedule.youtube_channel_id
      ? existingQuery.eq("youtube_channel_id", schedule.youtube_channel_id)
      : existingQuery.is("youtube_channel_id", null);
    const { data: existing } = await existingQuery;
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
        schedule_timezone: tz,
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
    repaired_failed: failedRepair.requeued,
    repaired_stuck: stuckRepair.requeued,
    reasons: reasons.slice(0, 20),
  });
}
