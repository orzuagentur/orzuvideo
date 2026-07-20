import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { PREVIEW_BUCKET, previewObjectPath } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * Authenticated playback/download for Creativity library videos.
 * Resolves file from Storage (storage_path) with signed URL, then public preview_url.
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
  const bucket =
    job.storage_bucket || meta.storage_bucket || PREVIEW_BUCKET;
  const key =
    job.storage_path ||
    meta.storage_path ||
    previewObjectPath(user.id, id);

  const admin = createServiceClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(key, 60 * 60);

  const target = signed?.signedUrl || job.preview_url || null;
  if (!target) {
    return NextResponse.json(
      {
        error:
          signErr?.message ||
          "Video file is not in Supabase Storage yet. Re-generate the video (worker must upload successfully).",
        bucket,
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
          "Content-Disposition": `attachment; filename="orzuvideo-${id.slice(0, 8)}.mp4"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.redirect(target);
    }
  }

  return NextResponse.redirect(target);
}
