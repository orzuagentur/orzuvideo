import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clearPendingYoutubeOAuth,
  findOtherChannelOwner,
  transferYoutubeChannel,
} from "@/lib/youtube-channel-transfer";
import {
  listOrzuOwnerEmails,
  notifyYoutubeChannelConnected,
  notifyYoutubeChannelTransferred,
} from "@/lib/youtube-notify";

export const runtime = "nodejs";

/**
 * Transfer a YouTube channel (and AI Training / schedule / jobs) from another
 * OrzuAi account onto the current user. Body: { channelId, action: "transfer" | "cancel" }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channelId?: string; action?: string } = {};
  try {
    body = (await request.json()) as { channelId?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = String(body.channelId || "").trim();
  const action = String(body.action || "transfer");

  if (action === "cancel") {
    await clearPendingYoutubeOAuth(user.id);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "youtube_access_token, youtube_refresh_token, youtube_token_expires_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.youtube_access_token && !profile?.youtube_refresh_token) {
    return NextResponse.json(
      { error: "Reconnect YouTube first, then transfer." },
      { status: 400 },
    );
  }

  try {
    const previousEmails = await listOrzuOwnerEmails(channelId, user.id);
    const other = await findOtherChannelOwner(channelId, user.id);
    const title = other?.title || "YouTube channel";

    const result = await transferYoutubeChannel({
      channelId,
      toUserId: user.id,
      accessToken: profile.youtube_access_token || null,
      refreshToken: profile.youtube_refresh_token || null,
      tokenExpiresAt: profile.youtube_token_expires_at || null,
      title,
    });

    void notifyYoutubeChannelTransferred({
      toEmails: previousEmails,
      channelTitle: title,
      channelId,
    }).catch((e) => console.error("youtube transfer notify failed", e));

    void notifyYoutubeChannelConnected({
      channelId,
      channelTitle: title,
      accessToken: profile.youtube_access_token,
      connectedByUserId: user.id,
      connectedByEmail: user.email || null,
    }).catch((e) => console.error("youtube connect notify failed", e));

    return NextResponse.json({ ok: true, fromUserIds: result.fromUserIds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Transfer failed" },
      { status: 500 },
    );
  }
}
