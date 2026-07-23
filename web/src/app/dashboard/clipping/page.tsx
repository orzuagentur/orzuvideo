import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AIClippingStudio } from "@/components/AIClippingStudio";
import type { VideoJob } from "@/lib/types";

export default async function ClippingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,description,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,duration_seconds,storage_path,storage_bucket,metadata",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const jobs = ((data || []) as VideoJob[]).filter((j) => {
    const src = String(j.metadata?.source || "").toLowerCase();
    const pipe = String(j.metadata?.pipeline || "").toLowerCase();
    if (src === "reedit" || pipe === "reedit") {
      return String(j.metadata?.library || "") === "clipping";
    }
    return src === "ai_clipping" || pipe === "ai_clipping" || src === "clipping";
  });

  return (
    <Suspense
      fallback={
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      }
    >
      <AIClippingStudio initialJobs={jobs} />
    </Suspense>
  );
}
