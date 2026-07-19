import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (err || !code) {
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret =
    process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${appUrl}/api/instagram/callback`;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=config`);
  }

  // 1) Short-lived user token
  const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("IG token error", tokenData);
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=token_error`);
  }

  let userToken = tokenData.access_token as string;

  // 2) Long-lived user token (~60 days)
  try {
    const llUrl = new URL(`${GRAPH}/oauth/access_token`);
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", appId);
    llUrl.searchParams.set("client_secret", appSecret);
    llUrl.searchParams.set("fb_exchange_token", userToken);
    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json();
    if (llRes.ok && llData.access_token) {
      userToken = llData.access_token;
    }
  } catch (e) {
    console.warn("IG long-lived exchange skipped", e);
  }

  // 3) Pages with Instagram Business Account
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) {
    console.error("IG pages error", pagesData);
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=pages_error`);
  }

  type Page = {
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: {
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      media_count?: number;
    };
  };

  const pages: Page[] = pagesData.data || [];
  const withIg = pages.filter((p) => p.instagram_business_account?.id);

  if (withIg.length === 0) {
    return NextResponse.redirect(
      `${appUrl}/instagram/account?ig=no_business_account`,
    );
  }

  // Prefer first linked IG Business account (picker can come later)
  const page = withIg[0];
  const ig = page.instagram_business_account!;
  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("instagram_accounts").upsert(
    {
      user_id: user.id,
      connected: true,
      ig_user_id: ig.id,
      username: ig.username || null,
      name: ig.name || page.name || null,
      profile_picture_url: ig.profile_picture_url || null,
      access_token: userToken,
      page_access_token: page.access_token,
      facebook_page_id: page.id,
      facebook_page_name: page.name,
      token_expires_at: expiresAt,
      followers_count: ig.followers_count || 0,
      media_count: ig.media_count || 0,
      stats_synced_at: new Date().toISOString(),
      token_type: "page",
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(error);
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=save_error`);
  }

  return NextResponse.redirect(`${appUrl}/instagram/account?ig=connected`);
}
