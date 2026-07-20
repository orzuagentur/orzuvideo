import { createClient } from "@/lib/supabase/server";
import { ChannelStudio } from "@/components/ChannelStudio";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import type { Profile, VideoJob } from "@/lib/types";

export default async function ChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const active = await getActiveYoutubeChannel(user!.id);

  let jobsQuery = supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,view_count,like_count,comment_count",
    )
    .eq("user_id", user!.id)
    .eq("status", "published")
    .order("completed_at", { ascending: false })
    .limit(50);

  if (active?.channel_id) {
    jobsQuery = jobsQuery.eq("youtube_channel_id", active.channel_id);
  }

  const [{ data: profile }, { data: videos }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    jobsQuery,
  ]);

  const safe: Profile | null = profile
    ? {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        youtube_connected: profile.youtube_connected || Boolean(active),
        youtube_channel_id: active?.channel_id || profile.youtube_channel_id,
        youtube_channel_title: active?.title || profile.youtube_channel_title,
        youtube_thumbnail_url:
          active?.thumbnail_url || profile.youtube_thumbnail_url,
        youtube_custom_url: active?.custom_url || profile.youtube_custom_url,
        youtube_subscriber_count:
          active?.subscriber_count ?? profile.youtube_subscriber_count,
        youtube_view_count: Number(
          active?.view_count ?? profile.youtube_view_count ?? 0,
        ),
        youtube_video_count: active?.video_count ?? profile.youtube_video_count,
        youtube_stats_synced_at: profile.youtube_stats_synced_at,
        daily_videos_enabled: profile.daily_videos_enabled,
        videos_per_day: profile.videos_per_day,
      }
    : null;

  return <ChannelStudio profile={safe} videos={(videos as VideoJob[]) || []} />;
}
