import { createClient } from "@/lib/supabase/server";
import { ContentStudio } from "@/components/ContentStudio";
import type { VideoJob } from "@/lib/types";

export default async function ContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return <ContentStudio jobs={(jobs as VideoJob[]) || []} />;
}
