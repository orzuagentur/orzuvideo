import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Queue a ready Instagram draft for Meta publish. */
export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("connected")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account?.connected) {
    return NextResponse.json({ error: "Connect Instagram first" }, { status: 400 });
  }

  const { data: job } = await supabase
    .from("instagram_jobs")
    .select("id, status, preview_url, metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "ready") {
    return NextResponse.json(
      { error: "Only ready drafts can be published" },
      { status: 400 },
    );
  }
  if (!job.preview_url) {
    return NextResponse.json({ error: "No preview video URL" }, { status: 400 });
  }

  const prev =
    job.metadata && typeof job.metadata === "object"
      ? (job.metadata as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("instagram_jobs")
    .update({
      status: "queued",
      scheduled_for: new Date().toISOString(),
      error_message: null,
      metadata: {
        ...prev,
        publish: true,
        publish_existing: true,
      },
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, job_id: id });
}
