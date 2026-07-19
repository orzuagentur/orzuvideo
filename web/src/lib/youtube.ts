import { createClient } from "@/lib/supabase/server";

export async function getFreshYoutubeAccessToken(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "youtube_access_token, youtube_refresh_token, youtube_token_expires_at, youtube_channel_id",
    )
    .eq("id", userId)
    .single();

  if (!profile?.youtube_refresh_token && !profile?.youtube_access_token) {
    throw new Error("YouTube is not connected");
  }

  let accessToken = profile.youtube_access_token as string | null;
  const expiresAt = profile.youtube_token_expires_at
    ? new Date(profile.youtube_token_expires_at).getTime()
    : 0;
  const needsRefresh =
    !accessToken || !expiresAt || expiresAt < Date.now() + 60_000;

  if (needsRefresh && profile.youtube_refresh_token) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: profile.youtube_refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || "Token refresh failed");
    }
    accessToken = data.access_token;
    await supabase
      .from("profiles")
      .update({
        youtube_access_token: data.access_token,
        youtube_token_expires_at: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : null,
      })
      .eq("id", userId);
  }

  if (!accessToken) throw new Error("YouTube session expired");
  return { accessToken, channelId: profile.youtube_channel_id as string | null, supabase };
}
