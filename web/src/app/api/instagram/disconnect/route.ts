import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("instagram_accounts").upsert(
    {
      user_id: user.id,
      connected: false,
      ig_user_id: null,
      username: null,
      name: null,
      profile_picture_url: null,
      access_token: null,
      page_access_token: null,
      facebook_page_id: null,
      facebook_page_name: null,
      token_expires_at: null,
      refresh_token: null,
      followers_count: 0,
      media_count: 0,
      stats_synced_at: null,
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
