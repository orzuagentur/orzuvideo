import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  deleteObject,
  deletePrefix,
  r2Configured,
} from "@/lib/r2";
import { clippingFolderPrefix, thumbObjectPath } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error: fetchErr } = await supabase
    .from("video_jobs")
    .select(
      "id,user_id,youtube_video_id,storage_path,storage_bucket,thumbnail_url,metadata",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = (job.metadata || {}) as {
    source?: string;
    publish?: boolean;
    storage_path?: string;
  };
  const src = String(meta.source || "").toLowerCase();
  const isPlatform =
    src === "creativity" ||
    src === "ai_clipping" ||
    src === "clipping" ||
    src === "reedit" ||
    (meta.publish === false && !job.youtube_video_id);
  if (!isPlatform) {
    return NextResponse.json(
      { error: "This job is linked to YouTube — manage it from Channel tools" },
      { status: 400 },
    );
  }

  // Delete R2 objects before DB row
  if (r2Configured()) {
    const keys = new Set<string>();
    const main =
      job.storage_path || meta.storage_path || `${user.id}/${id}.mp4`;
    if (main) keys.add(main);
    keys.add(thumbObjectPath(user.id, id));
    try {
      for (const key of keys) {
        await deleteObject(key).catch(() => undefined);
      }
      await deletePrefix(clippingFolderPrefix(user.id, id)).catch(() => 0);
    } catch (e) {
      console.error("[jobs DELETE] R2 cleanup:", e);
    }
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("video_jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
