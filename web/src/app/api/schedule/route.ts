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

  const { data: existing } = await supabase
    .from("publish_schedules")
    .select("*")
    .eq("user_id", user.id)
    .eq("youtube_channel_id", active.channel_id)
    .maybeSingle();

  // Lightweight toggle from Channel "AI content" switch
  const onlyToggle =
    typeof body.enabled === "boolean" &&
    body.times === undefined &&
    body.mode === undefined &&
    body.videos_per_day === undefined &&
    body.timezone === undefined;

  if (onlyToggle) {
    if (body.enabled === true) {
      const { data: training } = await supabase
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", user.id)
        .eq("youtube_channel_id", active.channel_id)
        .maybeSingle();
      if (!training?.is_trained) {
        return NextResponse.json(
          {
            error: "complete_training",
            message: "Configure AI Training first",
            redirect: "/dashboard/channel/training?enableAi=1",
          },
          { status: 400 },
        );
      }
    }

    const enabled = Boolean(body.enabled);
    if (existing?.id) {
      const { error } = await supabase
        .from("publish_schedules")
        .update({ enabled })
        .eq("id", existing.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (enabled) {
      const { error } = await supabase.from("publish_schedules").insert({
        user_id: user.id,
        youtube_channel_id: active.channel_id,
        enabled: true,
        mode: "daily",
        videos_per_day: 2,
        times: ["09:00", "18:00"],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        custom_dates: [],
        timezone: "Europe/Berlin",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await supabase
      .from("profiles")
      .update({ daily_videos_enabled: enabled })
      .eq("id", user.id);

    return NextResponse.json({ ok: true, enabled });
  }

  const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;
  const times: string[] = Array.isArray(body.times)
    ? body.times.map((t: unknown) => String(t))
    : existing?.times || ["09:00", "18:00"];
  const videos_per_day = Math.min(
    10,
    Math.max(1, Number(body.videos_per_day) || existing?.videos_per_day || 2),
  );
  const normalizedTimes: string[] = times
    .map((t: string) => {
      const [h, m] = String(t).trim().split(":");
      if (h == null) return "";
      return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
    })
    .filter(Boolean)
    .slice(0, videos_per_day);

  while (normalizedTimes.length < videos_per_day) {
    const fallback = ["09:00", "14:00", "18:00", "20:00", "12:00"][
      normalizedTimes.length
    ] || "12:00";
    if (!normalizedTimes.includes(fallback)) normalizedTimes.push(fallback);
    else
      normalizedTimes.push(
        `${String(8 + normalizedTimes.length).padStart(2, "0")}:00`,
      );
  }

  if (new Set(normalizedTimes).size !== normalizedTimes.length) {
    return NextResponse.json(
      { error: "Each video needs a different time of day." },
      { status: 400 },
    );
  }

  const payload = {
    user_id: user.id,
    youtube_channel_id: active.channel_id,
    enabled,
    mode: String(body.mode || existing?.mode || "daily"),
    videos_per_day,
    times: normalizedTimes,
    weekdays: Array.isArray(body.weekdays)
      ? body.weekdays.map(Number)
      : existing?.weekdays || [1, 2, 3, 4, 5, 6, 7],
    custom_dates: Array.isArray(body.custom_dates)
      ? body.custom_dates.map(String)
      : existing?.custom_dates || [],
    timezone: String(body.timezone || existing?.timezone || "Europe/Berlin"),
  };

  if (!["daily", "weekdays", "custom_days", "dates"].includes(payload.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

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
