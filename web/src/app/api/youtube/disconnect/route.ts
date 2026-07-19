import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      youtube_connected: false,
      youtube_channel_id: null,
      youtube_channel_title: null,
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_token_expires_at: null,
      youtube_thumbnail_url: null,
      youtube_custom_url: null,
      youtube_subscriber_count: 0,
      youtube_view_count: 0,
      youtube_video_count: 0,
      youtube_stats_synced_at: null,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
