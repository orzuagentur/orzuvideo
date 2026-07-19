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

  let channelTitle: string | null = null;
  let channelId: string | null = null;

  try {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const ch = await chRes.json();
    const item = ch.items?.[0];
    channelId = item?.id ?? null;
    channelTitle = item?.snippet?.title ?? null;
  } catch {
    // non-fatal
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const update: Record<string, unknown> = {
    youtube_connected: true,
    youtube_access_token: tokens.access_token,
    youtube_token_expires_at: expiresAt,
    youtube_channel_id: channelId,
    youtube_channel_title: channelTitle,
  };
  // Google only returns refresh_token on first consent
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

  return NextResponse.redirect(`${appUrl}/dashboard?youtube=connected`);
}
