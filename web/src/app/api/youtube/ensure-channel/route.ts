import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import { findOtherChannelOwner } from "@/lib/youtube-channel-transfer";
import { notifyYoutubeChannelConnected } from "@/lib/youtube-notify";

/**
 * After the user creates a YouTube channel in Google's UI, poll-friendly
 * endpoint: if a channel now exists, attach the first one to OrzuAi.
 * YouTube Data API cannot create channels server-side.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getFreshYoutubeAccessToken(user.id));
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Reconnect Google first",
        needsReconnect: true,
      },
      { status: 400 },
    );
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
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
    return NextResponse.json({
      ok: false,
      pending: true,
      createUrl: "https://www.youtube.com/create_channel",
      message: "No YouTube channel on this Google account yet.",
    });
  }

  const other = await findOtherChannelOwner(item.id, user.id);
  if (other) {
    return NextResponse.json(
      {
        error: "channel_owned",
        channelId: item.id,
        channelTitle: item.snippet?.title || "YouTube",
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          null,
        ownerEmail: other.email,
      },
      { status: 409 },
    );
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

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "youtube_access_token, youtube_refresh_token, youtube_token_expires_at, email",
    )
    .eq("id", user.id)
    .single();

  await supabase
    .from("youtube_channels")
    .update({ is_active: false })
    .eq("user_id", user.id);

  const { error: upsertErr } = await supabase.from("youtube_channels").upsert(
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
      access_token: profile?.youtube_access_token || accessToken,
      refresh_token: profile?.youtube_refresh_token || null,
      token_expires_at: profile?.youtube_token_expires_at || null,
      is_active: true,
    },
    { onConflict: "user_id,channel_id" },
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

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
    accessToken,
    connectedByUserId: user.id,
    connectedByEmail: profile?.email || user.email || null,
  }).catch((e) => console.error("youtube connect notify failed", e));

  return NextResponse.json({
    ok: true,
    channelId: item.id,
    channelTitle: title,
  });
}

export async function GET() {
  return POST();
}
