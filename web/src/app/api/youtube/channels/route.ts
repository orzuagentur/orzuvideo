import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type YtChannel = {
  id: string;
  title: string;
  thumbnail: string | null;
  customUrl: string | null;
};

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }
  return data as { access_token: string; expires_in?: number };
}

async function fetchChannels(accessToken: string): Promise<YtChannel[]> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to load YouTube channels");
  }

  return (data.items || []).map(
    (item: {
      id: string;
      snippet?: {
        title?: string;
        customUrl?: string;
        thumbnails?: { default?: { url?: string } };
      };
    }) => ({
      id: item.id,
      title: item.snippet?.title || "Untitled channel",
      thumbnail: item.snippet?.thumbnails?.default?.url || null,
      customUrl: item.snippet?.customUrl || null,
    }),
  );
}

async function getAccessTokenForUser(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "youtube_access_token, youtube_refresh_token, youtube_token_expires_at, youtube_channel_id",
    )
    .eq("id", userId)
    .single();

  if (!profile?.youtube_access_token && !profile?.youtube_refresh_token) {
    return { error: "Connect YouTube first", status: 400 as const };
  }

  let accessToken = profile.youtube_access_token as string | null;
  const expiresAt = profile.youtube_token_expires_at
    ? new Date(profile.youtube_token_expires_at).getTime()
    : 0;
  const needsRefresh =
    !accessToken || !expiresAt || expiresAt < Date.now() + 60_000;

  if (needsRefresh && profile.youtube_refresh_token) {
    try {
      const refreshed = await refreshAccessToken(profile.youtube_refresh_token);
      accessToken = refreshed.access_token;
      await supabase
        .from("profiles")
        .update({
          youtube_access_token: refreshed.access_token,
          youtube_token_expires_at: refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : null,
        })
        .eq("id", userId);
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? e.message
            : "YouTube session expired. Reconnect.",
        status: 401 as const,
      };
    }
  }

  if (!accessToken) {
    return {
      error: "YouTube session expired. Reconnect.",
      status: 401 as const,
    };
  }

  return {
    accessToken,
    selectedChannelId: profile.youtube_channel_id as string | null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenResult = await getAccessTokenForUser(user.id);
  if ("error" in tokenResult && tokenResult.error) {
    return NextResponse.json(
      { error: tokenResult.error },
      { status: tokenResult.status },
    );
  }

  try {
    const channels = await fetchChannels(
      (tokenResult as { accessToken: string }).accessToken,
    );
    return NextResponse.json({
      channels,
      selectedChannelId: (tokenResult as { selectedChannelId: string | null })
        .selectedChannelId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load channels" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const channelId = String(body.channelId || "").trim();
  const channelTitle = String(body.channelTitle || "").trim();

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  const tokenResult = await getAccessTokenForUser(user.id);
  if ("error" in tokenResult && tokenResult.error) {
    return NextResponse.json(
      { error: tokenResult.error },
      { status: tokenResult.status },
    );
  }

  let channels: YtChannel[];
  try {
    channels = await fetchChannels(
      (tokenResult as { accessToken: string }).accessToken,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load channels" },
      { status: 500 },
    );
  }

  const match = channels.find((c) => c.id === channelId);
  if (!match) {
    return NextResponse.json(
      {
        error:
          "This channel is not available for the connected Google account. Reconnect and pick the right Brand Account in Google.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      youtube_connected: true,
      youtube_channel_id: match.id,
      youtube_channel_title: channelTitle || match.title,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    channelId: match.id,
    channelTitle: channelTitle || match.title,
  });
}
