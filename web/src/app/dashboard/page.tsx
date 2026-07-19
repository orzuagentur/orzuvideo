import { createClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/DashboardHome";
import type { AiTraining, DashboardStats, Profile, VideoJob } from "@/lib/types";
import { QUEUE_STATUSES } from "@/lib/job-status";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: training }, { data: jobs }, { data: usage }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user!.id).single(),
      supabase.from("ai_training").select("*").eq("user_id", user!.id).maybeSingle(),
      supabase
        .from("video_jobs")
        .select(
          "id,status,title,script_text,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,view_count,like_count,comment_count",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("usage_events")
        .select("cost_usd, created_at")
        .eq("user_id", user!.id)
        .gte(
          "created_at",
          new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        ),
    ]);

  const list = (jobs as VideoJob[]) || [];
  const processing = new Set([
    "generating_script",
    "generating_voice",
    "fetching_media",
    "editing",
    "uploading",
  ]);

  const stats: DashboardStats = {
    published: list.filter((j) => j.status === "published").length,
    queued: list.filter((j) => j.status === "queued").length,
    processing: list.filter((j) => processing.has(j.status)).length,
    failed: list.filter((j) => j.status === "failed").length,
    total: list.length,
    costUsdMonth: (usage || []).reduce(
      (sum, row) => sum + Number(row.cost_usd || 0),
      0,
    ),
  };

  const safeProfile: Profile | null = profile
    ? {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        youtube_connected: profile.youtube_connected,
        youtube_channel_id: profile.youtube_channel_id,
        youtube_channel_title: profile.youtube_channel_title,
        youtube_thumbnail_url: profile.youtube_thumbnail_url,
        youtube_subscriber_count: profile.youtube_subscriber_count,
        youtube_view_count: profile.youtube_view_count,
        youtube_video_count: profile.youtube_video_count,
        daily_videos_enabled: profile.daily_videos_enabled,
        videos_per_day: profile.videos_per_day,
      }
    : null;

  const ready =
    Boolean(profile?.youtube_connected) && Boolean(training?.is_trained);

  // silence unused if TREE shakes
  void QUEUE_STATUSES;

  return (
    <DashboardHome
      profile={safeProfile}
      training={(training as AiTraining) || null}
      stats={stats}
      recent={list.slice(0, 8)}
      ready={ready}
    />
  );
}
