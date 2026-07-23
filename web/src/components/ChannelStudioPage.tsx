import { createClient } from "@/lib/supabase/server";
import { ChannelStudio } from "@/components/ChannelStudio";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import { getYoutubeAuthStatus } from "@/lib/youtube";
import { isYoutubeCacheFresh, normalizeBannerUrl } from "@/lib/youtube-sync";
import { QUEUE_STATUSES } from "@/lib/job-status";
import type { Profile, VideoJob } from "@/lib/types";

/** Shared Home / channel view: active YouTube channel already open. */
export async function ChannelStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const active = await getActiveYoutubeChannel(user!.id);
  const youtubeAuthStatus = await getYoutubeAuthStatus(user!.id);

  let publishedQuery = supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,view_count,like_count,comment_count,metadata",
    )
    .eq("user_id", user!.id)
    .eq("status", "published")
    .order("completed_at", { ascending: false })
    .limit(50);

  let queueQuery = supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,duration_seconds,metadata",
    )
    .eq("user_id", user!.id)
    .in("status", Array.from(QUEUE_STATUSES))
    .order("created_at", { ascending: false })
    .limit(20);

  if (active?.channel_id) {
    publishedQuery = publishedQuery.eq("youtube_channel_id", active.channel_id);
    queueQuery = queueQuery.eq("youtube_channel_id", active.channel_id);
  }

  const trainingQuery = active?.channel_id
    ? supabase
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", user!.id)
        .eq("youtube_channel_id", active.channel_id)
        .maybeSingle()
    : supabase
        .from("ai_training")
        .select("is_trained")
        .eq("user_id", user!.id)
        .maybeSingle();

  const scheduleQuery = active?.channel_id
    ? supabase
        .from("publish_schedules")
        .select("enabled")
        .eq("user_id", user!.id)
        .eq("youtube_channel_id", active.channel_id)
        .maybeSingle()
    : supabase
        .from("publish_schedules")
        .select("enabled")
        .eq("user_id", user!.id)
        .maybeSingle();

  const [
    { data: profile },
    { data: videos },
    { data: queue },
    { data: training },
    { data: schedule },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    publishedQuery,
    queueQuery,
    trainingQuery,
    scheduleQuery,
  ]);

  const videoList = (videos as VideoJob[]) || [];
  const likesFromVideos = videoList.reduce(
    (s, v) => s + Number(v.like_count || 0),
    0,
  );
  const commentsFromVideos = videoList.reduce(
    (s, v) => s + Number(v.comment_count || 0),
    0,
  );

  const syncedAt =
    (active as { stats_synced_at?: string | null } | null)?.stats_synced_at ||
    profile?.youtube_stats_synced_at ||
    null;

  const bannerFromDb = normalizeBannerUrl(
    (active as { banner_url?: string | null } | null)?.banner_url ||
      profile?.youtube_banner_url ||
      null,
  );

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
        youtube_banner_url: bannerFromDb,
        youtube_subscriber_count:
          active?.subscriber_count ?? profile.youtube_subscriber_count,
        youtube_view_count: Number(
          active?.view_count ?? profile.youtube_view_count ?? 0,
        ),
        youtube_video_count: active?.video_count ?? profile.youtube_video_count,
        youtube_like_count:
          (active as { like_count?: number | null } | null)?.like_count ??
          profile.youtube_like_count ??
          likesFromVideos,
        youtube_comment_count:
          (active as { comment_count?: number | null } | null)?.comment_count ??
          profile.youtube_comment_count ??
          commentsFromVideos,
        youtube_stats_synced_at: syncedAt,
        daily_videos_enabled: Boolean(
          schedule?.enabled ?? profile.daily_videos_enabled,
        ),
        videos_per_day: profile.videos_per_day,
      }
    : null;

  return (
    <ChannelStudio
      profile={safe}
      videos={videoList}
      initialQueue={(queue as VideoJob[]) || []}
      isTrained={Boolean(training?.is_trained)}
      aiContentEnabled={Boolean(
        schedule?.enabled ?? profile?.daily_videos_enabled,
      )}
      youtubeUnauthorized={youtubeAuthStatus === "unauthorized"}
      needsAutoSync={
        Boolean(safe?.youtube_connected) && !isYoutubeCacheFresh(syncedAt)
      }
    />
  );
}
