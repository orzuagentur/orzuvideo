import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

function parseIsoDurationSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
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
 * Refresh active channel stats + pull latest uploads from YouTube into video_jobs.
 * Previously only updated counters for jobs already in DB — new YT videos never appeared.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { accessToken, supabase: sb } = await getFreshYoutubeAccessToken(user.id);
    const active = await getActiveYoutubeChannel(user.id);
    const channelId = active?.channel_id || null;

    if (!channelId) {
      return NextResponse.json(
        { error: "No active YouTube channel selected" },
        { status: 400 },
      );
    }

    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,contentDetails&id=${encodeURIComponent(channelId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const ch = await chRes.json();
    if (!chRes.ok) {
      return NextResponse.json(
        { error: ch.error?.message || "Failed to fetch channel" },
        { status: 500 },
      );
    }

    const item = ch.items?.[0];
    if (!item) {
      return NextResponse.json(
        { error: "Channel not found on this Google account" },
        { status: 404 },
      );
    }

    const channelPatch = {
      youtube_channel_id: item.id as string,
      youtube_channel_title: (item.snippet?.title as string) || null,
      youtube_custom_url: (item.snippet?.customUrl as string) || null,
      youtube_thumbnail_url:
        (item.snippet?.thumbnails?.default?.url as string) || null,
      youtube_subscriber_count: Number(item.statistics?.subscriberCount || 0),
      youtube_view_count: Number(item.statistics?.viewCount || 0),
      youtube_video_count: Number(item.statistics?.videoCount || 0),
      youtube_stats_synced_at: new Date().toISOString(),
      youtube_connected: true,
    };

    await sb.from("profiles").update(channelPatch).eq("id", user.id);

    await sb
      .from("youtube_channels")
      .update({
        title: channelPatch.youtube_channel_title,
        custom_url: channelPatch.youtube_custom_url,
        thumbnail_url: channelPatch.youtube_thumbnail_url,
        subscriber_count: channelPatch.youtube_subscriber_count,
        view_count: channelPatch.youtube_view_count,
        video_count: channelPatch.youtube_video_count,
        stats_synced_at: channelPatch.youtube_stats_synced_at,
      })
      .eq("user_id", user.id)
      .eq("channel_id", channelId);

    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads as
      | string
      | undefined;

    let imported = 0;
    let updated = 0;
    const videoIds: string[] = [];

    if (uploadsPlaylistId) {
      // Latest ~50 uploads (enough for Channel UI)
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
        return NextResponse.json(
          { error: vData.error?.message || "Failed to fetch videos" },
          { status: 500 },
        );
      }

      const ytVideos = (vData.items || []) as YtVideo[];

      const { data: existing } = await sb
        .from("video_jobs")
        .select("id, youtube_video_id")
        .eq("user_id", user.id)
        .in("youtube_video_id", videoIds);

      const byYtId = new Map(
        (existing || []).map((j) => [j.youtube_video_id as string, j.id as string]),
      );

      for (const video of ytVideos) {
        const thumb =
          video.snippet?.thumbnails?.medium?.url ||
          video.snippet?.thumbnails?.high?.url ||
          video.snippet?.thumbnails?.default?.url ||
          null;
        const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
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
            user_id: user.id,
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

    // Also refresh any other published jobs for this channel not in the latest 50
    const { data: extraJobs } = await sb
      .from("video_jobs")
      .select("id, youtube_video_id")
      .eq("user_id", user.id)
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

    const bannerUrl =
      item.brandingSettings?.image?.bannerExternalUrl ||
      item.brandingSettings?.image?.bannerImageUrl ||
      null;

    return NextResponse.json({
      ok: true,
      bannerUrl,
      imported,
      updated,
      channelId,
      videoCount: channelPatch.youtube_video_count,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}
