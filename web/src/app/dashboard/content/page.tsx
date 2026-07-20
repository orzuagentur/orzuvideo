import { createClient } from "@/lib/supabase/server";
import { CreativityStudio } from "@/components/CreativityStudio";
import type { VideoJob } from "@/lib/types";

export default async function CreativityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds,storage_path,storage_bucket,metadata",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const list = ((jobs as VideoJob[]) || []).filter((j) => {
    const src = j.metadata?.source;
    if (src === "creativity") return true;
    if (!j.youtube_video_id && j.metadata?.publish === false) return true;
    return false;
  });

  return <CreativityStudio initialJobs={list} />;
}
