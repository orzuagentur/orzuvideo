import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (err || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard?youtube=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("YouTube token error", tokens);
    return NextResponse.redirect(`${appUrl}/dashboard?youtube=token_error`);
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const update: Record<string, unknown> = {
    youtube_connected: false,
    youtube_access_token: tokens.access_token,
    youtube_token_expires_at: expiresAt,
    youtube_channel_id: null,
    youtube_channel_title: null,
  };
  if (tokens.refresh_token) {
    update.youtube_refresh_token = tokens.refresh_token;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error(error);
    return NextResponse.redirect(`${appUrl}/dashboard?youtube=save_error`);
  }

  // Auto-add the channel linked to this Google login (mine=true).
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("youtube_refresh_token")
      .eq("id", user.id)
      .single();

    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true&maxResults=1",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );
    const chData = await chRes.json();
    const item = chData.items?.[0];
    if (chRes.ok && item?.id) {
      const title = item.snippet?.title || "YouTube";
      const customUrl = item.snippet?.customUrl || null;
      const thumbnail =
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        null;
      const subscriberCount = Number(item.statistics?.subscriberCount || 0);
      const viewCount = Number(item.statistics?.viewCount || 0);
      const videoCount = Number(item.statistics?.videoCount || 0);
      const refreshToken =
        tokens.refresh_token || profile?.youtube_refresh_token || null;

      await supabase
        .from("youtube_channels")
        .update({ is_active: false })
        .eq("user_id", user.id);

      await supabase.from("youtube_channels").upsert(
        {
          user_id: user.id,
          channel_id: item.id,
          title,
          custom_url: customUrl,
          thumbnail_url: thumbnail,
          subscriber_count: subscriberCount,
          view_count: viewCount,
          video_count: videoCount,
          stats_synced_at: new Date().toISOString(),
          access_token: tokens.access_token,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
          is_active: true,
        },
        { onConflict: "user_id,channel_id" },
      );

      await supabase
        .from("profiles")
        .update({
          youtube_connected: true,
          youtube_channel_id: item.id,
          youtube_channel_title: title,
          youtube_custom_url: customUrl,
          youtube_thumbnail_url: thumbnail,
          youtube_subscriber_count: subscriberCount,
          youtube_view_count: viewCount,
          youtube_video_count: videoCount,
          youtube_stats_synced_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      return NextResponse.redirect(`${appUrl}/dashboard/channel`);
    }
  } catch (e) {
    console.error("YouTube channel auto-add failed", e);
  }

  return NextResponse.redirect(`${appUrl}/dashboard?channels=1`);
}
