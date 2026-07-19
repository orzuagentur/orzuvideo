import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${appUrl}/api/instagram/callback`;

  if (!appId) {
    return NextResponse.redirect(`${appUrl}/instagram/account?ig=config`);
  }

  // Facebook Login → Instagram Business Account linked to a Page
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: user.id,
    response_type: "code",
    scope: [
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
    ].join(","),
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
  );
}
