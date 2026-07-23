import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncYoutubeChannel } from "@/lib/youtube-sync";

/**
 * Sync active channel from YouTube → DB.
 * Body: { force?: boolean }
 * - force=false (default): return DB cache if synced < 24h ago (no YouTube API)
 * - force=true: always hit YouTube and refresh changing stats (views/likes/comments/…)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  try {
    const result = await syncYoutubeChannel({ userId: user.id, force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}
