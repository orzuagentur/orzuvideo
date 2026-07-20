import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import { PREVIEW_BUCKET, previewObjectPath } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Upload a local MP4 from the device and queue YouTube publish
 * (worker uses publish_existing + preview_url).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await getActiveYoutubeChannel(user.id);
  if (!active?.channel_id) {
    return NextResponse.json(
      { error: "Select / connect a YouTube channel first" },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("youtube_connected")
    .eq("id", user.id)
    .single();
  if (!profile?.youtube_connected) {
    return NextResponse.json({ error: "Connect YouTube first" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") || "").trim() || "Short from device";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an MP4 file" }, { status: 400 });
  }
  if (!file.type.includes("video") && !file.name.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json({ error: "Only video/MP4 files are supported" }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 100 MB)" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const key = previewObjectPath(user.id, jobId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const admin = createServiceClient();

  const { error: upErr } = await admin.storage.from(PREVIEW_BUCKET).upload(key, bytes, {
    contentType: file.type || "video/mp4",
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(key);
  const preview_url = pub.publicUrl;

  const metadata = {
    publish: true,
    publish_existing: true,
    source: "youtube_device",
    pipeline: "youtube",
    youtube_channel_id: active.channel_id,
    used_ai_training: false,
    from_device: true,
  };

  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      id: jobId,
      user_id: user.id,
      youtube_channel_id: active.channel_id,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      title,
      preview_url,
      storage_path: key,
      storage_bucket: PREVIEW_BUCKET,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: job.id, preview_url });
}
