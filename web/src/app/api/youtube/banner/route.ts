import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import {
  isYoutubeCacheFresh,
  normalizeBannerUrl,
} from "@/lib/youtube-sync";

/** Channel banner — prefer DB cache; YouTube only if missing or cache expired. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const force =
    new URL(request.url).searchParams.get("force") === "1" ||
    new URL(request.url).searchParams.get("force") === "true";

  try {
    const active = await getActiveYoutubeChannel(user.id);
    const channelId = active?.channel_id || null;

    if (channelId) {
      const { data: row } = await supabase
        .from("youtube_channels")
        .select("banner_url, stats_synced_at")
        .eq("user_id", user.id)
        .eq("channel_id", channelId)
        .maybeSingle();

      const cached = normalizeBannerUrl(row?.banner_url);
      if (
        cached &&
        !force &&
        isYoutubeCacheFresh(row?.stats_synced_at as string | null)
      ) {
        return NextResponse.json({ bannerUrl: cached, cached: true });
      }
      if (cached && !force) {
        // Stale but still usable while a background sync may run
        return NextResponse.json({ bannerUrl: cached, cached: true, stale: true });
      }
    }

    const { accessToken } = await getFreshYoutubeAccessToken(user.id);
    const url = channelId
      ? `https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&id=${encodeURIComponent(channelId)}`
      : "https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to load banner" },
        { status: 500 },
      );
    }

    const item = data.items?.[0];
    const bannerUrl = normalizeBannerUrl(
      item?.brandingSettings?.image?.bannerExternalUrl ||
        item?.brandingSettings?.image?.bannerImageUrl ||
        null,
    );

    if (bannerUrl && channelId) {
      await supabase
        .from("youtube_channels")
        .update({ banner_url: bannerUrl })
        .eq("user_id", user.id)
        .eq("channel_id", channelId);
      await supabase
        .from("profiles")
        .update({ youtube_banner_url: bannerUrl })
        .eq("id", user.id);
    }

    return NextResponse.json({ bannerUrl, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed", bannerUrl: null },
      { status: 200 },
    );
  }
}
