import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, youtubeRedirectUri } from "@/lib/app-url";
import { findOtherChannelOwner } from "@/lib/youtube-channel-transfer";
import { notifyYoutubeChannelConnected } from "@/lib/youtube-notify";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const base = appUrl();

  if (err || !code) {
    return NextResponse.redirect(`${base}/dashboard?youtube=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${base}/login`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: youtubeRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("YouTube token error", tokens);
    return NextResponse.redirect(`${base}/dashboard?youtube=token_error`);
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
    return NextResponse.redirect(`${base}/dashboard?youtube=save_error`);
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("youtube_refresh_token, email")
      .eq("id", user.id)
      .single();

    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const [mineRes, managedRes] = await Promise.all([
      fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true&maxResults=50",
        { headers, cache: "no-store" },
      ),
      fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&managedByMe=true&maxResults=50",
        { headers, cache: "no-store" },
      ),
    ]);

    const mineData = await mineRes.json();
    const managedData = await managedRes.json();
    const items = [
      ...((mineRes.ok && mineData.items) || []),
      ...((managedRes.ok && managedData.items) || []),
    ];
    const byId = new Map<string, (typeof items)[0]>();
    for (const it of items) {
      if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
    }
    const item = byId.values().next().value as
      | {
          id: string;
          snippet?: {
            title?: string;
            customUrl?: string;
            thumbnails?: {
              medium?: { url?: string };
              default?: { url?: string };
            };
          };
          statistics?: {
            subscriberCount?: string;
            viewCount?: string;
            videoCount?: string;
          };
        }
      | undefined;

    if (!item?.id) {
      // Google account has OAuth but no YouTube channel yet
      return NextResponse.redirect(`${base}/dashboard?youtube=no_channel`);
    }

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

    const { data: ownRow } = await supabase
      .from("youtube_channels")
      .select("channel_id")
      .eq("user_id", user.id)
      .eq("channel_id", item.id)
      .maybeSingle();

    const other = await findOtherChannelOwner(item.id, user.id);
    if (other && !ownRow) {
      const q = new URLSearchParams({
        youtube: "transfer",
        channelId: item.id,
        title,
        ...(thumbnail ? { thumb: thumbnail } : {}),
        ...(other.email ? { from: other.email } : {}),
      });
      return NextResponse.redirect(`${base}/dashboard?${q.toString()}`);
    }

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

    void notifyYoutubeChannelConnected({
      channelId: item.id,
      channelTitle: title,
      accessToken: tokens.access_token,
      connectedByUserId: user.id,
      connectedByEmail: profile?.email || user.email || null,
    }).catch((e) => console.error("youtube connect notify failed", e));

    return NextResponse.redirect(`${base}/dashboard/channel`);
  } catch (e) {
    console.error("YouTube channel auto-add failed", e);
  }

  return NextResponse.redirect(`${base}/dashboard?youtube=no_channel`);
}
