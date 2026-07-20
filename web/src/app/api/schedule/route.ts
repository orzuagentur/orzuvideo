import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveYoutubeChannel(user.id);
  if (!active?.channel_id) {
    return NextResponse.json(
      { error: "Select an active YouTube channel first" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const enabled = Boolean(body.enabled);
  const times = Array.isArray(body.times)
    ? body.times.map(String)
    : ["09:00", "18:00"];
  const videos_per_day = Math.min(10, Math.max(1, Number(body.videos_per_day) || 2));
  let normalizedTimes = times
    .map((t) => {
      const [h, m] = String(t).trim().split(":");
      if (h == null) return "";
      return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
    })
    .filter(Boolean)
    .slice(0, videos_per_day);

  // Pad when schedule is off so we can still persist the toggle
  while (normalizedTimes.length < videos_per_day) {
    const fallback = ["09:00", "14:00", "18:00", "20:00", "12:00"][
      normalizedTimes.length
    ] || "12:00";
    if (!normalizedTimes.includes(fallback)) normalizedTimes.push(fallback);
    else normalizedTimes.push(`${String(8 + normalizedTimes.length).padStart(2, "0")}:00`);
  }

  if (enabled) {
    if (normalizedTimes.length < videos_per_day) {
      return NextResponse.json(
        {
          error: `Set ${videos_per_day} distinct times (one per video per day).`,
        },
        { status: 400 },
      );
    }
    if (new Set(normalizedTimes).size !== normalizedTimes.length) {
      return NextResponse.json(
        { error: "Each video needs a different time of day." },
        { status: 400 },
      );
    }
  } else {
    // ensure unique when disabled too
    const seen = new Set<string>();
    normalizedTimes = normalizedTimes.map((t, i) => {
      let cur = t;
      while (seen.has(cur)) {
        cur = `${String((8 + i) % 24).padStart(2, "0")}:00`;
      }
      seen.add(cur);
      return cur;
    });
  }

  const payload = {
    user_id: user.id,
    youtube_channel_id: active.channel_id,
    enabled,
    mode: String(body.mode || "daily"),
    videos_per_day,
    times: normalizedTimes,
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

  const { data: existing } = await supabase
    .from("publish_schedules")
    .select("id")
    .eq("user_id", user.id)
    .eq("youtube_channel_id", active.channel_id)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from("publish_schedules")
      .update(payload)
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("publish_schedules").insert(payload));
  }

  await supabase
    .from("profiles")
    .update({
      daily_videos_enabled: payload.enabled,
      videos_per_day: payload.videos_per_day,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, youtube_channel_id: active.channel_id });
}
