import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { objectSizeBytes, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

/** Old auto-seeded genre slugs — removed so only user-created genres remain. */
const SEEDED_SLUGS = [
  "epic",
  "motivational",
  "dark",
  "calm",
  "upbeat",
  "lofi",
  "workout",
  "luxury",
] as const;

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "genre"
  );
}

/** Remove old auto-seeded starter genres (Epic, Motivational, …). */
/** List shared platform genres with track count + total bytes. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: genres, error } = await supabase
    .from("music_genres")
    .select("id,name,slug,created_at")
    .eq("is_platform", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = genres || [];
  if (!list.length) {
    return NextResponse.json({ items: [] });
  }

  let tracks:
    | {
        id?: string;
        genre_id: string;
        storage_path?: string;
        file_size_bytes?: number | null;
      }[]
    | null = null;

  const withSize = await supabase
    .from("music_tracks")
    .select("id,genre_id,storage_path,file_size_bytes")
    .eq("is_platform", true);

  if (!withSize.error) {
    tracks = withSize.data;
  } else {
    const bare = await supabase
      .from("music_tracks")
      .select("id,genre_id,storage_path")
      .eq("is_platform", true);
    if (bare.error) {
      return NextResponse.json({ error: bare.error.message }, { status: 500 });
    }
    tracks = bare.data;
  }

  if (r2Configured() && tracks?.length) {
    const missing = tracks.filter(
      (t) =>
        t.storage_path &&
        (t.file_size_bytes == null || Number(t.file_size_bytes) <= 0),
    );
    await Promise.all(
      missing.slice(0, 60).map(async (t) => {
        const size = await objectSizeBytes(String(t.storage_path));
        if (size == null) return;
        t.file_size_bytes = size;
      }),
    );
  }

  const stats = new Map<string, { count: number; bytes: number }>();
  for (const t of tracks || []) {
    const gid = String(t.genre_id || "");
    if (!gid) continue;
    const cur = stats.get(gid) || { count: 0, bytes: 0 };
    cur.count += 1;
    cur.bytes += Number(t.file_size_bytes || 0);
    stats.set(gid, cur);
  }

  const items = list.map((g) => {
    const s = stats.get(g.id) || { count: 0, bytes: 0 };
    return {
      ...g,
      trackCount: s.count,
      totalBytes: s.bytes,
    };
  });

  return NextResponse.json({ items });
}

/** Create a genre. Body: { name } */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Genre name required" }, { status: 400 });
  }

  const slug = slugify(name);
  const blocked = new Set<string>(SEEDED_SLUGS);
  for (let i = 0; i < 8; i++) {
    let trySlug = i === 0 ? slug : `${slug}-${i + 1}`;
    if (blocked.has(trySlug)) trySlug = `${trySlug}-lib`;
    const { data, error } = await supabase
      .from("music_genres")
      .insert({ user_id: user.id, name, slug: trySlug })
      .select("id,name,slug,created_at")
      .single();
    if (!error && data) {
      return NextResponse.json({
        ok: true,
        item: { ...data, trackCount: 0, totalBytes: 0 },
      });
    }
    if (error && !String(error.message).includes("duplicate")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not create genre" }, { status: 500 });
}

/** Delete genre (+ cascades tracks). ?id= */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("music_genres")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
