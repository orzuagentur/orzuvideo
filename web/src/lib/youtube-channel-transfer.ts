import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/middleware";

export type ChannelOwnerInfo = {
  userId: string;
  email: string | null;
  title: string | null;
  thumbnailUrl: string | null;
};

function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local) return email;
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}***@${domain}`;
}

/** Find another OrzuAi account that already owns this YouTube channel_id. */
export async function findOtherChannelOwner(
  channelId: string,
  excludeUserId: string,
  client?: SupabaseClient,
): Promise<ChannelOwnerInfo | null> {
  const sb = client || createServiceClient();
  const { data: row } = await sb
    .from("youtube_channels")
    .select("user_id, title, thumbnail_url")
    .eq("channel_id", channelId)
    .neq("user_id", excludeUserId)
    .limit(1)
    .maybeSingle();

  if (!row?.user_id) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("email")
    .eq("id", row.user_id)
    .maybeSingle();

  return {
    userId: row.user_id as string,
    email: maskEmail(profile?.email as string | null),
    title: (row.title as string | null) || null,
    thumbnailUrl: (row.thumbnail_url as string | null) || null,
  };
}

async function reassignChannelRows(
  sb: SupabaseClient,
  table: string,
  channelId: string,
  fromUserId: string,
  toUserId: string,
) {
  // Drop target duplicates for this channel so unique (user_id, channel) holds
  await sb
    .from(table)
    .delete()
    .eq("user_id", toUserId)
    .eq("youtube_channel_id", channelId);

  await sb
    .from(table)
    .update({ user_id: toUserId })
    .eq("user_id", fromUserId)
    .eq("youtube_channel_id", channelId);
}

export type TransferChannelInput = {
  channelId: string;
  toUserId: string;
  /** Fresh OAuth tokens / meta for the destination account */
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  title?: string | null;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
};

/**
 * Move YouTube channel + AI Training / schedule / jobs from every other
 * OrzuAi account onto `toUserId`, then activate it for the new owner.
 */
export async function transferYoutubeChannel(
  input: TransferChannelInput,
): Promise<{ ok: true; fromUserIds: string[] }> {
  const sb = createServiceClient();
  const channelId = input.channelId;

  const { data: others } = await sb
    .from("youtube_channels")
    .select("user_id, title, custom_url, thumbnail_url, subscriber_count, view_count, video_count, banner_url, like_count, comment_count, stats_synced_at")
    .eq("channel_id", channelId)
    .neq("user_id", input.toUserId);

  const fromUserIds = (others || []).map((r) => r.user_id as string);
  const legacy = others?.[0];

  for (const fromUserId of fromUserIds) {
    await reassignChannelRows(sb, "ai_training", channelId, fromUserId, input.toUserId);
    await reassignChannelRows(
      sb,
      "publish_schedules",
      channelId,
      fromUserId,
      input.toUserId,
    );
    await reassignChannelRows(
      sb,
      "montage_settings",
      channelId,
      fromUserId,
      input.toUserId,
    );

    const { data: channelJobs } = await sb
      .from("video_jobs")
      .select("youtube_video_id")
      .eq("user_id", fromUserId)
      .eq("youtube_channel_id", channelId)
      .not("youtube_video_id", "is", null);

    const ytVideoIds = (channelJobs || [])
      .map((j) => j.youtube_video_id as string)
      .filter(Boolean);

    await sb
      .from("video_jobs")
      .update({ user_id: input.toUserId })
      .eq("user_id", fromUserId)
      .eq("youtube_channel_id", channelId);

    if (ytVideoIds.length) {
      await sb
        .from("comment_replies")
        .update({ user_id: input.toUserId })
        .eq("user_id", fromUserId)
        .in("youtube_video_id", ytVideoIds);
    }

    // Remove channel from old account
    await sb
      .from("youtube_channels")
      .delete()
      .eq("user_id", fromUserId)
      .eq("channel_id", channelId);

    const { data: oldProfile } = await sb
      .from("profiles")
      .select("youtube_channel_id")
      .eq("id", fromUserId)
      .maybeSingle();

    if (oldProfile?.youtube_channel_id === channelId) {
      // Pick another saved channel as active if any
      const { data: remaining } = await sb
        .from("youtube_channels")
        .select("channel_id, title, custom_url, thumbnail_url, subscriber_count, view_count, video_count, access_token, refresh_token, token_expires_at")
        .eq("user_id", fromUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (remaining?.channel_id) {
        await sb
          .from("youtube_channels")
          .update({ is_active: true })
          .eq("user_id", fromUserId)
          .eq("channel_id", remaining.channel_id);

        await sb
          .from("profiles")
          .update({
            youtube_connected: true,
            youtube_channel_id: remaining.channel_id,
            youtube_channel_title: remaining.title,
            youtube_custom_url: remaining.custom_url,
            youtube_thumbnail_url: remaining.thumbnail_url,
            youtube_subscriber_count: remaining.subscriber_count || 0,
            youtube_view_count: remaining.view_count || 0,
            youtube_video_count: remaining.video_count || 0,
            youtube_access_token: remaining.access_token,
            youtube_refresh_token: remaining.refresh_token,
            youtube_token_expires_at: remaining.token_expires_at,
            daily_videos_enabled: false,
          })
          .eq("id", fromUserId);
      } else {
        await sb
          .from("profiles")
          .update({
            youtube_connected: false,
            youtube_channel_id: null,
            youtube_channel_title: null,
            youtube_custom_url: null,
            youtube_thumbnail_url: null,
            youtube_access_token: null,
            youtube_refresh_token: null,
            youtube_token_expires_at: null,
            youtube_subscriber_count: 0,
            youtube_view_count: 0,
            youtube_video_count: 0,
            youtube_stats_synced_at: null,
            youtube_banner_url: null,
            daily_videos_enabled: false,
          })
          .eq("id", fromUserId);
      }
    }
  }

  // Activate on destination
  await sb
    .from("youtube_channels")
    .update({ is_active: false })
    .eq("user_id", input.toUserId);

  const title =
    input.title || (legacy?.title as string | null) || "YouTube channel";
  const customUrl =
    input.customUrl ?? (legacy?.custom_url as string | null) ?? null;
  const thumbnailUrl =
    input.thumbnailUrl ?? (legacy?.thumbnail_url as string | null) ?? null;

  await sb.from("youtube_channels").upsert(
    {
      user_id: input.toUserId,
      channel_id: channelId,
      title,
      custom_url: customUrl,
      thumbnail_url: thumbnailUrl,
      banner_url: legacy?.banner_url ?? null,
      subscriber_count:
        input.subscriberCount ?? Number(legacy?.subscriber_count || 0),
      view_count: input.viewCount ?? Number(legacy?.view_count || 0),
      video_count: input.videoCount ?? Number(legacy?.video_count || 0),
      like_count: Number(legacy?.like_count || 0),
      comment_count: Number(legacy?.comment_count || 0),
      stats_synced_at: legacy?.stats_synced_at || new Date().toISOString(),
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: input.tokenExpiresAt,
      is_active: true,
    },
    { onConflict: "user_id,channel_id" },
  );

  await sb
    .from("profiles")
    .update({
      youtube_connected: true,
      youtube_channel_id: channelId,
      youtube_channel_title: title,
      youtube_custom_url: customUrl,
      youtube_thumbnail_url: thumbnailUrl,
      youtube_subscriber_count:
        input.subscriberCount ?? Number(legacy?.subscriber_count || 0),
      youtube_view_count: input.viewCount ?? Number(legacy?.view_count || 0),
      youtube_video_count: input.videoCount ?? Number(legacy?.video_count || 0),
      youtube_access_token: input.accessToken,
      youtube_refresh_token: input.refreshToken,
      youtube_token_expires_at: input.tokenExpiresAt,
      youtube_stats_synced_at: new Date().toISOString(),
      youtube_banner_url: legacy?.banner_url ?? null,
    })
    .eq("id", input.toUserId);

  return { ok: true, fromUserIds };
}

/** Clear OAuth tokens on a user who cancelled a conflicted connect. */
export async function clearPendingYoutubeOAuth(userId: string) {
  const sb = createServiceClient();
  const { data: active } = await sb
    .from("youtube_channels")
    .select("channel_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (active?.channel_id) {
    // Had another active channel — restore from that row
    const { data: row } = await sb
      .from("youtube_channels")
      .select("*")
      .eq("user_id", userId)
      .eq("channel_id", active.channel_id)
      .maybeSingle();
    if (row) {
      await sb
        .from("profiles")
        .update({
          youtube_connected: true,
          youtube_channel_id: row.channel_id,
          youtube_channel_title: row.title,
          youtube_custom_url: row.custom_url,
          youtube_thumbnail_url: row.thumbnail_url,
          youtube_access_token: row.access_token,
          youtube_refresh_token: row.refresh_token,
          youtube_token_expires_at: row.token_expires_at,
          youtube_subscriber_count: row.subscriber_count || 0,
          youtube_view_count: row.view_count || 0,
          youtube_video_count: row.video_count || 0,
        })
        .eq("id", userId);
      return;
    }
  }

  await sb
    .from("profiles")
    .update({
      youtube_connected: false,
      youtube_channel_id: null,
      youtube_channel_title: null,
      youtube_custom_url: null,
      youtube_thumbnail_url: null,
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_token_expires_at: null,
      youtube_subscriber_count: 0,
      youtube_view_count: 0,
      youtube_video_count: 0,
      youtube_stats_synced_at: null,
    })
    .eq("id", userId);
}
