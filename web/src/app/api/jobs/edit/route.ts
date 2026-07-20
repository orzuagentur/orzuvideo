import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EFFECTS = new Set([
  "none",
  "cinematic",
  "vivid",
  "soft",
  "noir",
  "punch",
  "vignette",
]);
const MOTIONS = new Set([
  "none",
  "slow_push",
  "punch_in",
  "rise",
  "drift_left",
  "drift_right",
  "snap_zoom",
]);
const FADES = new Set(["none", "fade", "fadeblack", "fadewhite"]);

function parentLibrary(meta: Record<string, unknown> | null): "creativity" | "clipping" {
  const src = String(meta?.source || "").toLowerCase();
  const pipe = String(meta?.pipeline || "").toLowerCase();
  if (src === "ai_clipping" || pipe === "ai_clipping" || src === "clipping") {
    return "clipping";
  }
  if (src === "reedit" && meta?.library === "clipping") return "clipping";
  return "creativity";
}

/** Queue a re-edit of an existing ready video (new job, keeps original). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source_job_id = String(body.source_job_id || "").trim();
  if (!source_job_id) {
    return NextResponse.json({ error: "source_job_id required" }, { status: 400 });
  }

  const { data: parent, error: parentErr } = await supabase
    .from("video_jobs")
    .select(
      "id,user_id,status,title,preview_url,storage_path,storage_bucket,duration_seconds,metadata",
    )
    .eq("id", source_job_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 500 });
  }
  if (!parent) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  if (parent.status !== "ready") {
    return NextResponse.json(
      { error: "Only ready videos can be edited" },
      { status: 400 },
    );
  }
  if (!parent.storage_path && !parent.preview_url) {
    return NextResponse.json(
      { error: "Source video file is missing" },
      { status: 400 },
    );
  }

  const effect = String(body.effect || "none").trim();
  const motion = String(body.motion || "none").trim();
  const intro_fade = String(body.intro_fade || "none").trim();
  const outro_fade = String(body.outro_fade || "none").trim();
  if (!EFFECTS.has(effect)) {
    return NextResponse.json({ error: "Invalid effect" }, { status: 400 });
  }
  if (!MOTIONS.has(motion)) {
    return NextResponse.json({ error: "Invalid motion" }, { status: 400 });
  }
  if (!FADES.has(intro_fade) || !FADES.has(outro_fade)) {
    return NextResponse.json({ error: "Invalid fade" }, { status: 400 });
  }

  const music_mode = String(body.music_mode || "none").trim(); // none | auto | track
  const music_track_id =
    music_mode === "track"
      ? String(body.music_track_id || "").trim() || null
      : null;
  let music_volume = 0.45;
  try {
    music_volume = Math.max(
      0.05,
      Math.min(1, Number(body.music_volume ?? 0.45)),
    );
  } catch {
    music_volume = 0.45;
  }
  const keep_original_audio = body.keep_original_audio !== false;

  let trim_start = 0;
  let trim_end: number | null = null;
  try {
    trim_start = Math.max(0, Number(body.trim_start ?? 0));
  } catch {
    trim_start = 0;
  }
  if (body.trim_end != null && body.trim_end !== "") {
    try {
      trim_end = Math.max(trim_start + 0.5, Number(body.trim_end));
    } catch {
      trim_end = null;
    }
  }

  const parentMeta = (parent.metadata || {}) as Record<string, unknown>;
  const library = parentLibrary(parentMeta);
  const baseTitle = String(parent.title || "Video").trim() || "Video";
  const title = baseTitle.endsWith("(edit)")
    ? baseTitle
    : `${baseTitle.slice(0, 60)} (edit)`;

  const metadata = {
    source: "reedit",
    pipeline: "reedit",
    publish: false,
    parent_job_id: parent.id,
    library,
    parent_source: String(parentMeta.source || library),
    effect,
    motion,
    intro_fade,
    outro_fade,
    music_mode,
    music_track_id,
    music_volume,
    keep_original_audio,
    trim_start,
    trim_end,
    source_storage_path: parent.storage_path,
    source_storage_bucket: parent.storage_bucket || "short-previews",
    source_preview_url: parent.preview_url,
    aspect_ratio: parentMeta.aspect_ratio || "9:16",
  };

  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: user.id,
      status: "queued",
      title,
      script_text: null,
      description: null,
      scheduled_for: new Date().toISOString(),
      duration_seconds:
        trim_end != null
          ? Math.round(trim_end - trim_start)
          : parent.duration_seconds,
      metadata,
    })
    .select("id,status,title,metadata")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job });
}
