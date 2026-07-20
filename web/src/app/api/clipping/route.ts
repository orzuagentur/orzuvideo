import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { PREVIEW_BUCKET } from "@/lib/storage";

export const runtime = "nodejs";

const ASPECTS = new Set(["9:16", "16:9", "1:1"]);
const DURATIONS = new Set([15, 30, 45, 60]);
const MAX_BYTES = 200 * 1024 * 1024;

function sourceObjectPath(userId: string, jobId: string) {
  return `${userId}/clipping/${jobId}/source.mp4`;
}

/**
 * Upload a long device video and queue AI Clipping.
 * Does not require YouTube — output lands as a Ready draft.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const aspectRaw = String(form.get("aspect_ratio") || "9:16").trim();
  const durationRaw = Number(form.get("duration_seconds") || 30);
  const instructions = String(form.get("instructions") || "").trim().slice(0, 800);
  const addSubtitles = String(form.get("add_subtitles") ?? "1") !== "0";
  const addMusic = String(form.get("add_music") ?? "1") !== "0";
  const addEffects = String(form.get("add_effects") ?? "1") !== "0";
  const titleHint = String(form.get("title") || "").trim().slice(0, 80);

  const aspect_ratio = ASPECTS.has(aspectRaw) ? aspectRaw : "9:16";
  const duration_seconds = DURATIONS.has(durationRaw) ? durationRaw : 30;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a video from your device" }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (
    !file.type.includes("video") &&
    !name.endsWith(".mp4") &&
    !name.endsWith(".mov") &&
    !name.endsWith(".webm")
  ) {
    return NextResponse.json({ error: "Upload MP4, MOV, or WebM" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 400 });
  }
  if (file.size < 50_000) {
    return NextResponse.json({ error: "File looks too small" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const sourceKey = sourceObjectPath(user.id, jobId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const admin = createServiceClient();

  const { error: upErr } = await admin.storage.from(PREVIEW_BUCKET).upload(sourceKey, bytes, {
    contentType: file.type || "video/mp4",
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(sourceKey);
  const source_url = pub.publicUrl;

  const metadata = {
    publish: false,
    source: "ai_clipping",
    pipeline: "ai_clipping",
    source_url,
    source_storage_path: sourceKey,
    aspect_ratio,
    duration_seconds,
    duration_auto: false,
    add_subtitles: addSubtitles,
    add_music: addMusic,
    add_effects: addEffects,
    user_brief: instructions || null,
    instructions: instructions || null,
    from_device: true,
  };

  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      id: jobId,
      user_id: user.id,
      youtube_channel_id: null,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      title: titleHint || "AI Clip",
      preview_url: source_url,
      storage_path: sourceKey,
      storage_bucket: PREVIEW_BUCKET,
      duration_seconds,
      metadata,
    })
    .select("id,status,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Final cut is written by the worker to previewObjectPath(user, jobId)
  return NextResponse.json({
    ok: true,
    job_id: job.id,
    status: job.status,
  });
}
