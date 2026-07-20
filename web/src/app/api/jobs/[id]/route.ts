import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";

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
    .select("id,user_id,youtube_video_id,metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = (job.metadata || {}) as { source?: string; publish?: boolean };
  const isPlatform =
    meta.source === "creativity" ||
    (meta.publish === false && !job.youtube_video_id);
  if (!isPlatform) {
    return NextResponse.json(
      { error: "This job is linked to YouTube — manage it from Channel tools" },
      { status: 400 },
    );
  }

  // Service role so delete works even if user DELETE RLS is not applied yet
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
