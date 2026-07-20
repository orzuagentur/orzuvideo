import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

const ASPECTS = new Set(["9:16", "16:9", "1:1"]);
const DURATIONS = new Set([15, 30, 45, 60]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    brief?: string;
    publish?: boolean;
    duration_seconds?: number | null | "auto";
    duration_auto?: boolean;
    aspect_ratio?: string;
    source?: string;
    pipeline?: string;
  } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const brief = String(body.brief || "").trim();
  const source = String(body.source || "").trim();
  const pipeline = String(body.pipeline || "").trim();
  const isCreativity = source === "creativity" || pipeline === "creativity";
  // Creativity is platform-only — never YouTube publish, never AI Training
  const publish = isCreativity ? false : body.publish !== false;

  const durationAuto =
    body.duration_auto === true ||
    body.duration_seconds === "auto" ||
    body.duration_seconds === null ||
    (isCreativity && body.duration_seconds === undefined && body.duration_auto !== false);

  let duration_seconds: number | null = null;
  if (!durationAuto) {
    const durationRaw = Number(body.duration_seconds);
    duration_seconds = DURATIONS.has(durationRaw) ? durationRaw : 30;
  }

  const aspect = String(body.aspect_ratio || "9:16").trim();
  const aspect_ratio = ASPECTS.has(aspect) ? aspect : "9:16";

  if (!brief) {
    return NextResponse.json(
      { error: "Write a prompt for the video first" },
      { status: 400 },
    );
  }
  if (brief.length < 8) {
    return NextResponse.json(
      { error: "Prompt is too short — describe the video in at least one sentence" },
      { status: 400 },
    );
  }

  let channelId: string | null = null;

  if (!isCreativity) {
    const active = await getActiveYoutubeChannel(user.id);
    channelId = active?.channel_id || null;

    const [{ data: profile }, { data: training }] = await Promise.all([
      supabase.from("profiles").select("youtube_connected").eq("id", user.id).single(),
      channelId
        ? supabase
            .from("ai_training")
            .select("is_trained")
            .eq("user_id", user.id)
            .eq("youtube_channel_id", channelId)
            .maybeSingle()
        : supabase
            .from("ai_training")
            .select("is_trained")
            .eq("user_id", user.id)
            .maybeSingle(),
    ]);

    if (!training?.is_trained) {
      return NextResponse.json(
        { error: "Train the AI for this channel first (Channel → AI Training)" },
        { status: 400 },
      );
    }
    if (publish && (!profile?.youtube_connected || !channelId)) {
      return NextResponse.json(
        { error: "Connect / select a YouTube channel first" },
        { status: 400 },
      );
    }
  }

  const metadata: Record<string, unknown> = {
    publish,
    source: isCreativity ? "creativity" : publish ? "dashboard" : "content_plus",
    pipeline: isCreativity ? "creativity" : "youtube",
    user_brief: brief,
    duration_auto: durationAuto,
    duration_seconds: durationAuto ? null : duration_seconds,
    aspect_ratio,
    used_ai_training: false,
  };
  if (!isCreativity) {
    metadata.youtube_channel_id = channelId;
    metadata.used_ai_training = true;
  }

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: user.id,
      youtube_channel_id: isCreativity ? null : channelId,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      duration_seconds: duration_seconds,
      // Title filled by worker AI after script generation
      title: null,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    job_id: data.id,
    publish: false,
    duration_auto: durationAuto,
    duration_seconds,
    aspect_ratio,
    source: isCreativity ? "creativity" : metadata.source,
  });
}
