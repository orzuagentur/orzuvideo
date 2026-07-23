import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

type Ctx = { params: Promise<{ id: string }> };

/** Queue an existing draft (status=ready) for YouTube upload. */
export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("youtube_connected")
    .eq("id", user.id)
    .single();

  if (!profile?.youtube_connected) {
    return NextResponse.json({ error: "Connect YouTube first" }, { status: 400 });
  }

  const active = await getActiveYoutubeChannel(user.id);
  if (!active?.channel_id) {
    return NextResponse.json(
      { error: "Select an active YouTube channel first" },
      { status: 400 },
    );
  }

  const { data: job } = await supabase
    .from("video_jobs")
    .select("id,status,metadata,preview_url,video_path,storage_path,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "ready") {
    return NextResponse.json(
      { error: "Only ready drafts can be published" },
      { status: 400 },
    );
  }
  if (!job.preview_url && !job.video_path && !job.storage_path) {
    return NextResponse.json({ error: "No video file to publish" }, { status: 400 });
  }

  const prevMeta =
    job.metadata && typeof job.metadata === "object"
      ? (job.metadata as Record<string, unknown>)
      : {};

  const { data, error } = await supabase
    .from("video_jobs")
    .update({
      status: "queued",
      scheduled_for: new Date().toISOString(),
      error_message: null,
      metadata: {
        ...prevMeta,
        publish: true,
        publish_existing: true,
        youtube_channel_id: active.channel_id,
      },
      youtube_channel_id: active.channel_id,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "ready")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json(
      { error: "Draft is no longer ready to publish" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, job_id: id });
}
