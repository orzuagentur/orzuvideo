import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";

/** Refresh views/likes/comments for published jobs from YouTube API. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobIds?: string[]; channelId?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  try {
    const { accessToken } = await getFreshYoutubeAccessToken(user.id);

    let query = supabase
      .from("video_jobs")
      .select("id, youtube_video_id, youtube_channel_id")
      .eq("user_id", user.id)
      .eq("status", "published")
      .not("youtube_video_id", "is", null);

    if (body.channelId) {
      query = query.eq("youtube_channel_id", body.channelId);
    }
    if (body.jobIds?.length) {
      query = query.in("id", body.jobIds);
    }

    const { data: jobs } = await query.limit(50);
    const ids = (jobs || [])
      .map((j) => j.youtube_video_id)
      .filter(Boolean) as string[];

    if (!ids.length) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // YouTube allows up to 50 ids per request
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const vData = await vRes.json();
    if (!vRes.ok) {
      return NextResponse.json(
        { error: vData.error?.message || "YouTube videos.list failed" },
        { status: 500 },
      );
    }

    let updated = 0;
    const items: Array<{
      id: string;
      view_count: number;
      like_count: number;
      comment_count: number;
      thumbnail_url: string | null;
      title?: string;
    }> = [];

    for (const video of vData.items || []) {
      const job = (jobs || []).find((j) => j.youtube_video_id === video.id);
      if (!job) continue;
      const patch = {
        view_count: Number(video.statistics?.viewCount || 0),
        like_count: Number(video.statistics?.likeCount || 0),
        comment_count: Number(video.statistics?.commentCount || 0),
        thumbnail_url:
          video.snippet?.thumbnails?.medium?.url ||
          video.snippet?.thumbnails?.high?.url ||
          null,
        title: video.snippet?.title || undefined,
      };
      const { error } = await supabase
        .from("video_jobs")
        .update(patch)
        .eq("id", job.id);
      if (!error) {
        updated += 1;
        items.push({ id: job.id, ...patch });
      }
    }

    return NextResponse.json({ ok: true, updated, items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}
