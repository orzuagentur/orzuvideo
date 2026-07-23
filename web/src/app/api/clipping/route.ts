import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { objectSizeBytes, publicObjectUrl, r2Configured } from "@/lib/r2";
import { MEDIA_BUCKET } from "@/lib/storage";
import { SUBTITLE_STYLE_IDS } from "@/lib/editor-catalog";

export const runtime = "nodejs";

const ASPECTS = new Set(["9:16", "16:9", "1:1"]);
const DURATIONS = new Set([15, 30, 45, 60]);
const MAX_SOURCES = 6;
const MAX_SOURCE_BYTES = 500 * 1024 * 1024;

const PEXELS_HOSTS = [
  "videos.pexels.com",
  "player.vimeo.com",
  "vimeo.com",
  "vod-progressive.akamaized.net",
];

function isAllowedMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return PEXELS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

type SourceIn = {
  kind?: string;
  title?: string;
  url?: string;
  download_url?: string;
  storage_path?: string;
  storage_bucket?: string;
  media_id?: string;
  provider?: string;
};

/**
 * Queue an AI Clipping job.
 * Device files: client-uploaded to Cloudflare R2 (presigned PUT).
 * Media: Pexels URLs from our Media search API.
 */
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

  const aspectRaw = String(body.aspect_ratio || "9:16").trim();
  const durationRaw = Number(body.duration_seconds || 30);
  const instructions = String(body.instructions || body.user_brief || "")
    .trim()
    .slice(0, 800);
  const addSubtitles = body.add_subtitles !== false;
  const addMusic = body.add_music !== false;
  const useVoice = body.use_voice !== false;
  const voiceId = String(body.voice_id || "").trim() || null;
  const musicTrackId = String(body.music_track_id || "").trim() || null;
  const musicGroup = String(body.music_group || "").trim() || null;
  const subtitleStyleRaw = String(body.subtitle_style || "classic").trim();
  const subtitle_style = SUBTITLE_STYLE_IDS.has(subtitleStyleRaw)
    ? subtitleStyleRaw
    : "classic";
  // Effects + transitions are always on (AI)
  const addEffects = true;
  const addTransitions = true;
  const titleHint = String(body.title || "").trim().slice(0, 80);
  const jobId =
    typeof body.job_id === "string" && body.job_id.length > 10
      ? body.job_id
      : crypto.randomUUID();

  const aspect_ratio = ASPECTS.has(aspectRaw) ? aspectRaw : "9:16";
  const duration_seconds = DURATIONS.has(durationRaw) ? durationRaw : 30;

  const rawSources = Array.isArray(body.sources) ? (body.sources as SourceIn[]) : [];
  if (rawSources.length === 0) {
    return NextResponse.json(
      { error: "Add at least one video (device or Media library)" },
      { status: 400 },
    );
  }
  if (rawSources.length > MAX_SOURCES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_SOURCES} videos per clip` },
      { status: 400 },
    );
  }

  const sources: Array<{
    kind: string;
    title: string;
    url: string;
    storage_path: string | null;
    storage_bucket: string | null;
    media_id: string | null;
    provider: string | null;
  }> = [];

  for (const s of rawSources) {
    const kind = String(s.kind || "device").toLowerCase();
    const title =
      String(s.title || "Clip source").trim().slice(0, 120) || "Clip source";

    if (kind === "media") {
      const url = String(s.download_url || s.url || "").trim();
      if (!url || !isAllowedMediaUrl(url)) {
        return NextResponse.json(
          { error: "Invalid Media / Pexels video URL" },
          { status: 400 },
        );
      }
      sources.push({
        kind: "media",
        title,
        url,
        storage_path: null,
        storage_bucket: null,
        media_id: String(s.media_id || "").trim() || null,
        provider: String(s.provider || "pexels").trim() || "pexels",
      });
      continue;
    }

    // device — file already in R2 via /api/storage/presign
    const storage_path = String(s.storage_path || "").trim() || null;
    const storage_bucket =
      String(s.storage_bucket || MEDIA_BUCKET).trim() || MEDIA_BUCKET;
    let url = String(s.url || "").trim();

    if (storage_path && !storage_path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
    }
    if (!url && !storage_path) {
      return NextResponse.json(
        { error: "Each device source needs a storage path or URL" },
        { status: 400 },
      );
    }
    if (storage_path) {
      if (!r2Configured()) {
        return NextResponse.json(
          { error: "Cloudflare R2 is not configured" },
          { status: 503 },
        );
      }
      const size = await objectSizeBytes(storage_path);
      if (size == null || size <= 512) {
        return NextResponse.json(
          { error: "Uploaded source file was not found in R2" },
          { status: 400 },
        );
      }
      if (size > MAX_SOURCE_BYTES) {
        return NextResponse.json(
          { error: "Source file too large (max 500 MB)" },
          { status: 400 },
        );
      }
    }
    if (!url && storage_path) {
      try {
        url = publicObjectUrl(storage_path);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Could not build R2 public URL",
          },
          { status: 500 },
        );
      }
    }

    sources.push({
      kind: "device",
      title,
      url,
      storage_path,
      storage_bucket,
      media_id: null,
      provider: null,
    });
  }

  const first = sources[0];
  const metadata = {
    publish: false,
    source: "ai_clipping",
    pipeline: "ai_clipping",
    sources,
    source_url: first.url,
    source_storage_path: first.storage_path,
    aspect_ratio,
    duration_seconds,
    duration_auto: false,
    add_subtitles: addSubtitles,
    subtitle_style: addSubtitles ? subtitle_style : null,
    add_music: addMusic,
    add_effects: addEffects,
    add_transitions: addTransitions,
    use_voice: useVoice,
    voice_id: voiceId,
    music_track_id: musicTrackId,
    music_group: musicGroup,
    user_brief: instructions || null,
    instructions: instructions || null,
    from_device: sources.some((s) => s.kind === "device"),
    from_media: sources.some((s) => s.kind === "media"),
  };

  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      id: jobId,
      user_id: user.id,
      youtube_channel_id: null,
      status: "queued",
      scheduled_for: new Date().toISOString(),
      title: titleHint || (sources.length > 1 ? "AI Mix Clip" : "AI Clip"),
      preview_url: first.kind === "device" ? first.url : null,
      storage_path: first.storage_path,
      storage_bucket: first.storage_bucket || MEDIA_BUCKET,
      duration_seconds,
      metadata,
    })
    .select("id,status,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    job_id: job.id,
    status: job.status,
  });
}
