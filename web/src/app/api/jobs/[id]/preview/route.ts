import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  objectExists,
  publicObjectUrl,
  r2Configured,
  signedGetUrl,
} from "@/lib/r2";
import { MEDIA_BUCKET, previewObjectPath } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * Authenticated playback/download for library videos in Cloudflare R2.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error } = await supabase
    .from("video_jobs")
    .select("id,user_id,preview_url,storage_path,storage_bucket,status,metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const meta = (job.metadata || {}) as {
    storage_path?: string;
    storage_bucket?: string;
  };
  const key =
    job.storage_path ||
    meta.storage_path ||
    previewObjectPath(user.id, id);

  let target: string | null = null;

  if (r2Configured() && key) {
    try {
      // Prefer short-lived signed URL (works even if bucket is private)
      target = await signedGetUrl(key, 60 * 60);
    } catch (e) {
      console.error("[preview] R2 signed URL failed:", e);
      try {
        if (await objectExists(key)) {
          target = publicObjectUrl(key);
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!target) {
    target = job.preview_url || null;
  }

  if (!target) {
    return NextResponse.json(
      {
        error:
          "Video file is not in Cloudflare R2 yet. Re-generate the video after R2 is configured.",
        bucket: job.storage_bucket || MEDIA_BUCKET,
        path: key,
        status: job.status,
      },
      { status: 404 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (download) {
    try {
      const upstream = await fetch(target);
      if (!upstream.ok) {
        return NextResponse.redirect(target);
      }
      const buf = await upstream.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="orzuai-${id.slice(0, 8)}.mp4"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.redirect(target);
    }
  }

  return NextResponse.redirect(target);
}
