import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import {
  listYoutubeChannels,
  setActiveYoutubeChannel,
} from "@/lib/youtube-channels";
import { findOtherChannelOwner } from "@/lib/youtube-channel-transfer";
import { notifyYoutubeChannelConnected } from "@/lib/youtube-notify";

export type YtChannel = {
  id: string;
  title: string;
  thumbnail: string | null;
  customUrl: string | null;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
};

function mapItem(item: {
  id: string;
  snippet?: {
    title?: string;
    customUrl?: string;
    thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
}): YtChannel {
  return {
    id: item.id,
    title: item.snippet?.title || "Untitled channel",
    thumbnail:
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      null,
    customUrl: item.snippet?.customUrl || null,
    subscriberCount: Number(item.statistics?.subscriberCount || 0),
    viewCount: Number(item.statistics?.viewCount || 0),
    videoCount: Number(item.statistics?.videoCount || 0),
  };
}

async function fetchGoogleChannels(accessToken: string): Promise<{
  channels: YtChannel[];
  diagnostics: string[];
}> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const diagnostics: string[] = [];
  const byId = new Map<string, YtChannel>();

  const urls: { label: string; url: string }[] = [
    {
      label: "mine",
      url: "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true&maxResults=50",
    },
    {
      label: "managedByMe",
      url: "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&managedByMe=true&maxResults=50",
    },
  ];

  for (const { label, url } of urls) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        diagnostics.push(
          `${label}: ${data.error?.message || res.statusText || res.status}`,
        );
        continue;
      }
      const count = (data.items || []).length;
      diagnostics.push(`${label}: ${count} channel(s)`);
      for (const item of data.items || []) {
        if (!item?.id || byId.has(item.id)) continue;
        byId.set(item.id, mapItem(item));
      }
    } catch (e) {
      diagnostics.push(
        `${label}: ${e instanceof Error ? e.message : "request failed"}`,
      );
    }
  }

  return { channels: Array.from(byId.values()), diagnostics };
}

/** List saved channels + Google account channels available to add. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const saved = await listYoutubeChannels(user.id);
  const active = saved.find((c) => c.is_active) || null;

  let available: YtChannel[] = [];
  let googleError: string | null = null;
  let diagnostics: string[] = [];

  try {
    const { accessToken } = await getFreshYoutubeAccessToken(user.id);
    const result = await fetchGoogleChannels(accessToken);
    available = result.channels;
    diagnostics = result.diagnostics;
    if (available.length === 0 && diagnostics.length) {
      googleError =
        "No channels returned for this Google token. Try Refresh, or create a channel on YouTube.";
    }
  } catch (e) {
    googleError = e instanceof Error ? e.message : "Connect YouTube first";
  }

  return NextResponse.json({
    saved,
    available,
    selectedChannelId: active?.channel_id || null,
    googleError,
    diagnostics,
  });
}

/**
 * body.action:
 *  - "select" | default: set active among saved (or add+activate from Google list)
 *  - "add": upsert channel from Google list into youtube_channels
 *  - "switch": alias of select among saved
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const action = String(body.action || "select");
  const channelId = String(body.channelId || "").trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    if (action === "switch") {
      await setActiveYoutubeChannel(user.id, channelId);
      return NextResponse.json({ ok: true, channelId });
    }

    const { accessToken } = await getFreshYoutubeAccessToken(user.id);
    const { channels: available } = await fetchGoogleChannels(accessToken);
    let match = available.find((c) => c.id === channelId);

    // Fallback: fetch this channel id directly (token may still read it)
    if (!match) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (res.ok && data.items?.[0]) {
        match = mapItem(data.items[0]);
      }
    }

    if (!match) {
      const saved = await listYoutubeChannels(user.id);
      if (saved.some((c) => c.channel_id === channelId)) {
        await setActiveYoutubeChannel(user.id, channelId);
        return NextResponse.json({ ok: true, channelId });
      }
      return NextResponse.json(
        {
          error:
            "Channel not found on this Google account. Open Add channel and Refresh.",
        },
        { status: 400 },
      );
    }

    const other = await findOtherChannelOwner(match.id, user.id);
    if (other) {
      const alreadyMine = (await listYoutubeChannels(user.id)).some(
        (c) => c.channel_id === match.id,
      );
      if (!alreadyMine) {
        return NextResponse.json(
          {
            error: "channel_owned",
            message:
              "This YouTube channel is already connected to another OrzuAi account.",
            channelId: match.id,
            channelTitle: match.title,
            thumbnail: match.thumbnail,
            ownerEmail: other.email,
          },
          { status: 409 },
        );
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "youtube_access_token, youtube_refresh_token, youtube_token_expires_at",
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
        channel_id: match.id,
        title: match.title,
        custom_url: match.customUrl,
        thumbnail_url: match.thumbnail,
        subscriber_count: match.subscriberCount || 0,
        view_count: match.viewCount || 0,
        video_count: match.videoCount || 0,
        stats_synced_at: new Date().toISOString(),
        access_token: profile?.youtube_access_token || null,
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
        youtube_channel_id: match.id,
        youtube_channel_title: match.title,
        youtube_custom_url: match.customUrl,
        youtube_thumbnail_url: match.thumbnail,
        youtube_subscriber_count: match.subscriberCount || 0,
        youtube_view_count: match.viewCount || 0,
        youtube_video_count: match.videoCount || 0,
        youtube_stats_synced_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    const { data: me } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    void notifyYoutubeChannelConnected({
      channelId: match.id,
      channelTitle: match.title,
      accessToken,
      connectedByUserId: user.id,
      connectedByEmail: me?.email || user.email || null,
    }).catch((e) => console.error("youtube connect notify failed", e));

    return NextResponse.json({
      ok: true,
      channelId: match.id,
      channelTitle: match.title,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
