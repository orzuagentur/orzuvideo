import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";

/** Fetch active channel banner from YouTube brandingSettings. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { accessToken, channelId } = await getFreshYoutubeAccessToken(user.id);
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
    const bannerUrl =
      item?.brandingSettings?.image?.bannerExternalUrl ||
      item?.brandingSettings?.image?.bannerImageUrl ||
      null;

    return NextResponse.json({ bannerUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed", bannerUrl: null },
      { status: 200 },
    );
  }
}
