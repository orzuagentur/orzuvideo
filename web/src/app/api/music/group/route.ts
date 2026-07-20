import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MUSIC_GROUPS } from "@/lib/music-groups";

/**
 * List ~15 instrumental tracks for a built-in music group (Jamendo).
 * GET ?group=epic
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "JAMENDO_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const groupId = String(searchParams.get("group") || "").trim();
  const qOverride = String(searchParams.get("q") || "").trim();

  const group = MUSIC_GROUPS.find((g) => g.id === groupId);
  const query = qOverride || group?.query || "soundtrack instrumental";

  const base = {
    client_id: clientId,
    format: "json",
    limit: "15",
    offset: "0",
    audioformat: "mp32",
    audiodlformat: "mp32",
    include: "musicinfo",
    order: "popularity_total",
    vocalinstrumental: "instrumental",
  };

  const strategies: Record<string, string>[] = [
    { fuzzytags: query.split(/\s+/).slice(0, 3).join(" ") },
    { tags: query.split(/\s+/).slice(0, 2).join("+") },
    { search: query },
    { tags: "soundtrack" },
  ];

  let results: Array<Record<string, unknown>> = [];
  for (const strategy of strategies) {
    const params = new URLSearchParams({ ...base, ...strategy });
    const res = await fetch(
      `https://api.jamendo.com/v3.0/tracks/?${params}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    const headers = data.headers || {};
    if (String(headers.code ?? "0") !== "0") continue;
    const batch = data.results || [];
    if (batch.length > 0) {
      results = batch;
      break;
    }
  }

  const tracks = results.map((t) => ({
    id: String(t.id),
    name: String(t.name || `Track #${t.id}`),
    artist: String(t.artist_name || "Jamendo"),
    previewUrl: (t.audio || t.audiodownload || null) as string | null,
    thumb: (t.image || null) as string | null,
    durationSec: typeof t.duration === "number" ? t.duration : null,
  }));

  return NextResponse.json({
    ok: true,
    groupId: group?.id || groupId || null,
    label: group?.label || "Search",
    tracks,
  });
}
