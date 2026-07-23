import type { SupabaseClient } from "@supabase/supabase-js";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

/** Auto YouTube refresh interval — serve DB cache between syncs. */
export const YOUTUBE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type YoutubeChannelSnapshot = {
  title: string | null;
  customUrl: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  likeCount: number;
  commentCount: number;
  videoViews: number;
  statsSyncedAt: string | null;
};

export type YoutubeSyncResult = {
  ok: true;
  cached: boolean;
  bannerUrl: string | null;
  imported: number;
  updated: number;
  channelId: string;
  channel: YoutubeChannelSnapshot;
  nextSyncAt: string | null;
};

function parseIsoDurationSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

export function normalizeBannerUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.includes("=")) return raw;
  return `${raw}=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`;
}

export function isYoutubeCacheFresh(
  syncedAt: string | null | undefined,
  ttlMs: number = YOUTUBE_CACHE_TTL_MS,
): boolean {
  if (!syncedAt) return false;
  const t = new Date(syncedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ttlMs;
}

export function nextSyncAtIso(syncedAt: string | null | undefined): string | null {
  if (!syncedAt) return null;
  const t = new Date(syncedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + YOUTUBE_CACHE_TTL_MS).toISOString();
}

async function loadCachedSnapshot(
  sb: SupabaseClient,
  userId: string,
  channelId: string,
): Promise<YoutubeChannelSnapshot | null> {
  const { data: row } = await sb
    .from("youtube_channels")
    .select(
      "title, custom_url, thumbnail_url, banner_url, subscriber_count, view_count, video_count, like_count, comment_count, stats_synced_at",
    )
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!row) return null;

  const { data: totalsRows } = await sb
    .from("video_jobs")
    .select("view_count, like_count, comment_count")
    .eq("user_id", userId)
    .eq("status", "published")
    .eq("youtube_channel_id", channelId);

  let videoViews = 0;
  let likes = Number(row.like_count || 0);
  let comments = Number(row.comment_count || 0);
  if (totalsRows?.length) {
    likes = 0;
    comments = 0;
    for (const r of totalsRows) {
      videoViews += Number(r.view_count || 0);
      likes += Number(r.like_count || 0);
      comments += Number(r.comment_count || 0);
    }
  }

  return {
    title: row.title || null,
    customUrl: row.custom_url || null,
    thumbnailUrl: row.thumbnail_url || null,
    bannerUrl: normalizeBannerUrl(row.banner_url),
    subscriberCount: Number(row.subscriber_count || 0),
    viewCount: Number(row.view_count || 0),
    videoCount: Number(row.video_count || 0),
    likeCount: likes,
    commentCount: comments,
    videoViews,
    statsSyncedAt: row.stats_synced_at || null,
  };
}

type YtVideo = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
};

/**
 * Full YouTube channel sync → DB.
 * When force=false and cache is fresh (<24h), returns DB snapshot without YouTube API.
 */
export async function syncYoutubeChannel(opts: {
  userId: string;
  force?: boolean;
}): Promise<YoutubeSyncResult> {
  const { accessToken, supabase: sb } = await getFreshYoutubeAccessToken(
    opts.userId,
  );
  const active = await getActiveYoutubeChannel(opts.userId);
  const channelId = active?.channel_id || null;

  if (!channelId) {
    throw new Error("No active YouTube channel selected");
  }

  const force = Boolean(opts.force);
  const cached = await loadCachedSnapshot(sb, opts.userId, channelId);

  if (!force && cached && isYoutubeCacheFresh(cached.statsSyncedAt)) {
    return {
      ok: true,
      cached: true,
      bannerUrl: cached.bannerUrl,
      imported: 0,
      updated: 0,
      channelId,
      channel: cached,
      nextSyncAt: nextSyncAtIso(cached.statsSyncedAt),
    };
  }

  const chRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,contentDetails&id=${encodeURIComponent(channelId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const ch = await chRes.json();
  if (!chRes.ok) {
    throw new Error(ch.error?.message || "Failed to fetch channel");
  }

  const item = ch.items?.[0];
  if (!item) {
    throw new Error("Channel not found on this Google account");
  }

  const rawBanner =
    item.brandingSettings?.image?.bannerExternalUrl ||
    item.brandingSettings?.image?.bannerImageUrl ||
    null;
  const bannerDisplay = normalizeBannerUrl(rawBanner);
  const syncedAt = new Date().toISOString();

  const channelPatch = {
    youtube_channel_id: item.id as string,
    youtube_channel_title: (item.snippet?.title as string) || null,
    youtube_custom_url: (item.snippet?.customUrl as string) || null,
    youtube_thumbnail_url:
      (item.snippet?.thumbnails?.default?.url as string) || null,
    youtube_subscriber_count: Number(item.statistics?.subscriberCount || 0),
    youtube_view_count: Number(item.statistics?.viewCount || 0),
    youtube_video_count: Number(item.statistics?.videoCount || 0),
    youtube_banner_url: bannerDisplay,
    youtube_stats_synced_at: syncedAt,
    youtube_connected: true,
  };

  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads as
    | string
    | undefined;

  let imported = 0;
  let updated = 0;
  const videoIds: string[] = [];

  if (uploadsPlaylistId) {
    const plUrl = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems",
    );
    plUrl.searchParams.set("part", "contentDetails");
    plUrl.searchParams.set("playlistId", uploadsPlaylistId);
    plUrl.searchParams.set("maxResults", "50");

    const plRes = await fetch(plUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const plData = await plRes.json();
    if (plRes.ok) {
      for (const row of plData.items || []) {
        const vid = row.contentDetails?.videoId as string | undefined;
        if (vid) videoIds.push(vid);
      }
    }
  }

  if (videoIds.length) {
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const vData = await vRes.json();
    if (!vRes.ok) {
      throw new Error(vData.error?.message || "Failed to fetch videos");
    }

    const ytVideos = (vData.items || []) as YtVideo[];

    const { data: existing } = await sb
      .from("video_jobs")
      .select("id, youtube_video_id")
      .eq("user_id", opts.userId)
      .in("youtube_video_id", videoIds);

    const byYtId = new Map(
      (existing || []).map((j) => [
        j.youtube_video_id as string,
        j.id as string,
      ]),
    );

    for (const video of ytVideos) {
      const thumb =
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.high?.url ||
        video.snippet?.thumbnails?.default?.url ||
        null;
      const publishedAt =
        video.snippet?.publishedAt || new Date().toISOString();
      const patch = {
        title: video.snippet?.title || null,
        description: video.snippet?.description || null,
        view_count: Number(video.statistics?.viewCount || 0),
        like_count: Number(video.statistics?.likeCount || 0),
        comment_count: Number(video.statistics?.commentCount || 0),
        thumbnail_url: thumb,
        duration_seconds: parseIsoDurationSeconds(
          video.contentDetails?.duration,
        ),
        youtube_channel_id: channelId,
        youtube_url: `https://www.youtube.com/watch?v=${video.id}`,
        status: "published" as const,
        completed_at: publishedAt,
      };

      const existingId = byYtId.get(video.id);
      if (existingId) {
        const { error } = await sb
          .from("video_jobs")
          .update(patch)
          .eq("id", existingId);
        if (!error) updated += 1;
      } else {
        const { error } = await sb.from("video_jobs").insert({
          user_id: opts.userId,
          youtube_video_id: video.id,
          scheduled_for: publishedAt,
          created_at: publishedAt,
          metadata: {
            source: "youtube_import",
            pipeline: "youtube",
            publish: true,
            imported_from_youtube: true,
            youtube_channel_id: channelId,
          },
          ...patch,
        });
        if (!error) imported += 1;
      }
    }
  }

  // Refresh engagement for older published videos outside the latest 50
  const { data: extraJobs } = await sb
    .from("video_jobs")
    .select("id, youtube_video_id")
    .eq("user_id", opts.userId)
    .eq("status", "published")
    .eq("youtube_channel_id", channelId)
    .not("youtube_video_id", "is", null)
    .limit(40);

  const extraIds = (extraJobs || [])
    .map((j) => j.youtube_video_id as string)
    .filter((id) => id && !videoIds.includes(id));

  if (extraIds.length) {
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${extraIds.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const vData = await vRes.json();
    for (const video of vData.items || []) {
      const job = (extraJobs || []).find((j) => j.youtube_video_id === video.id);
      if (!job) continue;
      await sb
        .from("video_jobs")
        .update({
          view_count: Number(video.statistics?.viewCount || 0),
          like_count: Number(video.statistics?.likeCount || 0),
          comment_count: Number(video.statistics?.commentCount || 0),
          thumbnail_url: video.snippet?.thumbnails?.medium?.url || null,
          title: video.snippet?.title || undefined,
        })
        .eq("id", job.id);
      updated += 1;
    }
  }

  const { data: totalsRows } = await sb
    .from("video_jobs")
    .select("view_count, like_count, comment_count")
    .eq("user_id", opts.userId)
    .eq("status", "published")
    .eq("youtube_channel_id", channelId);

  let totalLikes = 0;
  let totalComments = 0;
  let totalViewsFromVideos = 0;
  for (const row of totalsRows || []) {
    totalLikes += Number(row.like_count || 0);
    totalComments += Number(row.comment_count || 0);
    totalViewsFromVideos += Number(row.view_count || 0);
  }

  await sb
    .from("profiles")
    .update({
      ...channelPatch,
      youtube_like_count: totalLikes,
      youtube_comment_count: totalComments,
    })
    .eq("id", opts.userId);

  await sb
    .from("youtube_channels")
    .update({
      title: channelPatch.youtube_channel_title,
      custom_url: channelPatch.youtube_custom_url,
      thumbnail_url: channelPatch.youtube_thumbnail_url,
      banner_url: bannerDisplay,
      subscriber_count: channelPatch.youtube_subscriber_count,
      view_count: channelPatch.youtube_view_count,
      video_count: channelPatch.youtube_video_count,
      like_count: totalLikes,
      comment_count: totalComments,
      stats_synced_at: syncedAt,
    })
    .eq("user_id", opts.userId)
    .eq("channel_id", channelId);

  const snapshot: YoutubeChannelSnapshot = {
    title: channelPatch.youtube_channel_title,
    customUrl: channelPatch.youtube_custom_url,
    thumbnailUrl: channelPatch.youtube_thumbnail_url,
    bannerUrl: bannerDisplay,
    subscriberCount: channelPatch.youtube_subscriber_count,
    viewCount: channelPatch.youtube_view_count,
    videoCount: channelPatch.youtube_video_count,
    likeCount: totalLikes,
    commentCount: totalComments,
    videoViews: totalViewsFromVideos,
    statsSyncedAt: syncedAt,
  };

  return {
    ok: true,
    cached: false,
    bannerUrl: bannerDisplay,
    imported,
    updated,
    channelId,
    channel: snapshot,
    nextSyncAt: nextSyncAtIso(syncedAt),
  };
}
