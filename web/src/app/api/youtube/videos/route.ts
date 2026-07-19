import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const youtubeVideoId = String(body.youtubeVideoId || "").trim();
  if (!youtubeVideoId) {
    return NextResponse.json({ error: "youtubeVideoId required" }, { status: 400 });
  }

  try {
    const { accessToken, supabase: sb } = await getFreshYoutubeAccessToken(user.id);

    const del = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(youtubeVideoId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!del.ok && del.status !== 204) {
      const err = await del.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error?.message || "YouTube delete failed" },
        { status: 500 },
      );
    }

    await sb
      .from("video_jobs")
      .update({
        status: "failed",
        error_message: "Deleted by user",
        youtube_url: null,
      })
      .eq("user_id", user.id)
      .eq("youtube_video_id", youtubeVideoId);

    await sb.from("usage_events").insert({
      user_id: user.id,
      provider: "youtube",
      kind: "video_delete",
      units: 1,
      unit_label: "actions",
      cost_usd: 0,
      meta: { youtube_video_id: youtubeVideoId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
