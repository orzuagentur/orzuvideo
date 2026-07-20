import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { accessToken, supabase: sb } = await getFreshYoutubeAccessToken(user.id);

    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&mine=true",
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
      return NextResponse.json({ error: "No channel found" }, { status: 404 });
    }

    await sb
      .from("profiles")
      .update({
        youtube_channel_id: item.id,
        youtube_channel_title: item.snippet?.title || null,
        youtube_custom_url: item.snippet?.customUrl || null,
        youtube_thumbnail_url: item.snippet?.thumbnails?.default?.url || null,
        youtube_subscriber_count: Number(item.statistics?.subscriberCount || 0),
        youtube_view_count: Number(item.statistics?.viewCount || 0),
        youtube_video_count: Number(item.statistics?.videoCount || 0),
        youtube_stats_synced_at: new Date().toISOString(),
        youtube_connected: true,
      })
      .eq("id", user.id);

    // Refresh stats for published jobs
    const { data: jobs } = await sb
      .from("video_jobs")
      .select("id, youtube_video_id")
      .eq("user_id", user.id)
      .eq("status", "published")
      .not("youtube_video_id", "is", null)
      .limit(40);

    const ids = (jobs || []).map((j) => j.youtube_video_id).filter(Boolean);
    if (ids.length) {
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(",")}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const vData = await vRes.json();
      for (const video of vData.items || []) {
        const job = (jobs || []).find((j) => j.youtube_video_id === video.id);
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
      }
    }

    const bannerUrl =
      item.brandingSettings?.image?.bannerExternalUrl ||
      item.brandingSettings?.image?.bannerImageUrl ||
      null;

    return NextResponse.json({ ok: true, bannerUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}
