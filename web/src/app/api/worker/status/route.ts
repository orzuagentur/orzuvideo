import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";

function configured(...keys: string[]) {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const [
    { data: profile },
    { data: training },
    { data: schedule },
    { data: jobs },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "youtube_connected, youtube_channel_title, youtube_channel_id, daily_videos_enabled, videos_per_day",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("ai_training")
      .select("is_trained, niche, language, duration_seconds")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("publish_schedules")
      .select("enabled, mode, times, timezone, videos_per_day")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("video_jobs")
      .select("id, status, created_at, completed_at, updated_at, metadata")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("video_jobs")
      .select("id, status, updated_at")
      .eq("user_id", user.id)
      .in("status", [
        "generating_script",
        "generating_voice",
        "fetching_media",
        "editing",
        "uploading",
      ])
      .gte("updated_at", recentCutoff)
      .limit(5),
  ]);

  let heartbeat: { last_seen_at?: string; hostname?: string; meta?: unknown } | null =
    null;
  try {
    const { data } = await supabase
      .from("worker_presence")
      .select("last_seen_at, hostname, meta")
      .eq("id", "main")
      .maybeSingle();
    heartbeat = data;
  } catch {
    try {
      const sb = createServiceClient();
      const { data } = await sb
        .from("worker_presence")
        .select("last_seen_at, hostname, meta")
        .eq("id", "main")
        .maybeSingle();
      heartbeat = data;
    } catch {
      heartbeat = null;
    }
  }

  const heartbeatAt = heartbeat?.last_seen_at
    ? new Date(heartbeat.last_seen_at).getTime()
    : 0;
  const heartbeatFresh = heartbeatAt > Date.now() - 90_000;
  const jobsFresh = (recentActivity || []).length > 0;
  const workerOnline = heartbeatFresh || jobsFresh;

  const list = jobs || [];
  const counts = {
    queued: list.filter((j) => j.status === "queued").length,
    processing: list.filter((j) =>
      [
        "generating_script",
        "generating_voice",
        "fetching_media",
        "editing",
        "uploading",
      ].includes(j.status),
    ).length,
    ready: list.filter((j) => j.status === "ready").length,
    published: list.filter((j) => j.status === "published").length,
    failed: list.filter((j) => j.status === "failed").length,
  };

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    worker: {
      online: workerOnline,
      source: heartbeatFresh ? "heartbeat" : jobsFresh ? "job_activity" : "none",
      lastSeenAt: heartbeat?.last_seen_at || recentActivity?.[0]?.updated_at || null,
      hostname: heartbeat?.hostname || null,
      hint: workerOnline
        ? "Worker is processing or recently pinged."
        : "Start the Python worker: cd worker && python main.py",
    },
    profile: {
      youtubeConnected: Boolean(profile?.youtube_connected),
      channelTitle: profile?.youtube_channel_title || null,
      channelId: profile?.youtube_channel_id || null,
      dailyEnabled: Boolean(profile?.daily_videos_enabled),
      videosPerDay: profile?.videos_per_day ?? 2,
    },
    training: {
      ready: Boolean(training?.is_trained),
      niche: training?.niche || null,
      language: training?.language || null,
      durationSeconds: training?.duration_seconds ?? null,
    },
    schedule: {
      enabled: Boolean(schedule?.enabled ?? profile?.daily_videos_enabled),
      mode: schedule?.mode || "daily",
      times: schedule?.times || [],
      timezone: schedule?.timezone || "UTC",
      videosPerDay: schedule?.videos_per_day ?? profile?.videos_per_day ?? 2,
    },
    pipeline24h: counts,
    integrations: [
      {
        id: "supabase",
        label: "Supabase",
        ok: configured("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        scope: "platform",
      },
      {
        id: "cron",
        label: "Vercel Cron",
        ok: configured("CRON_SECRET") || process.env.VERCEL === "1",
        scope: "platform",
      },
      {
        id: "youtube",
        label: "YouTube OAuth",
        ok:
          configured("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REDIRECT_URI") &&
          Boolean(profile?.youtube_connected),
        scope: "account",
      },
      {
        id: "openai",
        label: "OpenAI",
        ok: configured("OPENAI_API_KEY"),
        scope: "worker",
        note: "Also required in worker/.env",
      },
      {
        id: "elevenlabs",
        label: "ElevenLabs",
        ok: configured("ELEVENLABS_API_KEY"),
        scope: "worker",
        note: "Also required in worker/.env",
      },
      {
        id: "pexels",
        label: "Pexels",
        ok: configured("PEXELS_API_KEY"),
        scope: "worker",
        note: "Also required in worker/.env",
      },
      {
        id: "jamendo",
        label: "Jamendo",
        ok: configured("JAMENDO_CLIENT_ID"),
        scope: "worker",
        note: "Also required in worker/.env",
      },
      {
        id: "ffmpeg",
        label: "FFmpeg",
        ok: workerOnline,
        scope: "worker",
        note: "Must be installed on the machine running the worker",
      },
    ],
  });
}
