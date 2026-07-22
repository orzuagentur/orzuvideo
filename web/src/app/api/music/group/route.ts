import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Tracks for AI Training / pickers — from own R2 library by genre slug or id.
 * GET ?group=epic  OR  ?genre_id=uuid
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const groupId = String(searchParams.get("group") || "").trim();
  const genreIdParam = String(searchParams.get("genre_id") || "").trim();
  const q = String(searchParams.get("q") || "").trim();

  let genreId = genreIdParam;
  let label = "Library";

  if (!genreId && groupId) {
    const { data: g } = await supabase
      .from("music_genres")
      .select("id,name,slug")
      .eq("is_platform", true)
      .eq("slug", groupId)
      .maybeSingle();
    if (g) {
      genreId = g.id;
      label = g.name;
    }
  } else if (genreId) {
    const { data: g } = await supabase
      .from("music_genres")
      .select("id,name")
      .eq("id", genreId)
      .eq("is_platform", true)
      .maybeSingle();
    if (g) label = g.name;
  }

  let query = supabase
    .from("music_tracks")
    .select(
      "id,title,artist,mood,duration_sec,public_url,genre_id,music_genres(name,slug)",
    )
    .eq("is_platform", true)
    .order("created_at", { ascending: false })
    .limit(40);

  if (genreId) query = query.eq("genre_id", genreId);
  if (q) {
    query = query.or(`title.ilike.%${q}%,artist.ilike.%${q}%,mood.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tracks = (data || []).map((t) => ({
    id: String(t.id),
    name: String(t.title || "Track"),
    artist: String(t.artist || ""),
    mood: String(t.mood || ""),
    previewUrl: (t.public_url || null) as string | null,
    thumb: null as string | null,
    durationSec:
      typeof t.duration_sec === "number" ? t.duration_sec : null,
  }));

  return NextResponse.json({
    ok: true,
    groupId: groupId || genreId || null,
    label,
    tracks,
    source: "library",
  });
}
