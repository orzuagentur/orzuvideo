import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoEditorStudio } from "@/components/VideoEditorStudio";
import type { VideoJob } from "@/lib/types";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds,storage_path,storage_bucket,metadata",
    )
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!job) notFound();
  if (job.status !== "ready") {
    const src = String(job.metadata?.source || "").toLowerCase();
    const pipe = String(job.metadata?.pipeline || "").toLowerCase();
    const lib = String(job.metadata?.library || "").toLowerCase();
    if (
      src === "ai_clipping" ||
      pipe === "ai_clipping" ||
      lib === "clipping"
    ) {
      redirect("/dashboard/clipping");
    }
    redirect("/dashboard/content");
  }

  return <VideoEditorStudio job={job as VideoJob} />;
}
