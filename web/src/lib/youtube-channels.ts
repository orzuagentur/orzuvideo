import { createClient } from "@/lib/supabase/server";

export type YtChannelRow = {
  id: string;
  user_id: string;
  channel_id: string;
  title: string | null;
  custom_url: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  is_active: boolean;
};

/** Active YouTube channel for the logged-in user (DB row). */
export async function getActiveYoutubeChannel(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youtube_channels")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (data) return data as YtChannelRow & Record<string, unknown>;

  // Legacy fallback: profile fields
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "youtube_channel_id, youtube_channel_title, youtube_thumbnail_url, youtube_custom_url, youtube_subscriber_count, youtube_view_count, youtube_video_count, youtube_connected",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.youtube_channel_id) return null;

  return {
    id: "",
    user_id: userId,
    channel_id: profile.youtube_channel_id as string,
    title: profile.youtube_channel_title as string | null,
    custom_url: profile.youtube_custom_url as string | null,
    thumbnail_url: profile.youtube_thumbnail_url as string | null,
    subscriber_count: profile.youtube_subscriber_count as number | null,
    view_count: Number(profile.youtube_view_count || 0),
    video_count: profile.youtube_video_count as number | null,
    is_active: true,
  };
}

export async function listYoutubeChannels(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youtube_channels")
    .select(
      "id, user_id, channel_id, title, custom_url, thumbnail_url, subscriber_count, view_count, video_count, is_active",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data || []) as YtChannelRow[];
}

export async function setActiveYoutubeChannel(
  userId: string,
  channelId: string,
) {
  const supabase = await createClient();

  const { data: row, error: findErr } = await supabase
    .from("youtube_channels")
    .select("*")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!row) throw new Error("Channel not found. Add it first.");

  await supabase
    .from("youtube_channels")
    .update({ is_active: false })
    .eq("user_id", userId);

  await supabase
    .from("youtube_channels")
    .update({ is_active: true })
    .eq("user_id", userId)
    .eq("channel_id", channelId);

  await supabase
    .from("profiles")
    .update({
      youtube_connected: true,
      youtube_channel_id: row.channel_id,
      youtube_channel_title: row.title,
      youtube_custom_url: row.custom_url,
      youtube_thumbnail_url: row.thumbnail_url,
      youtube_subscriber_count: row.subscriber_count,
      youtube_view_count: row.view_count,
      youtube_video_count: row.video_count,
      youtube_access_token: row.access_token || undefined,
      youtube_refresh_token: row.refresh_token || undefined,
      youtube_token_expires_at: row.token_expires_at || undefined,
    })
    .eq("id", userId);

  return row;
}
