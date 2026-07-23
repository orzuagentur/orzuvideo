import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, youtubeRedirectUri } from "@/lib/app-url";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const base = appUrl();
  if (!user) {
    return NextResponse.redirect(`${base}/login`);
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const redirectUri = youtubeRedirectUri();

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "YOUTUBE_CLIENT_ID / YOUTUBE_REDIRECT_URI missing" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/youtube",
    ].join(" "),
    access_type: "offline",
    // select_account lets user pick Google account / Brand Account channel
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state: user.id,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
