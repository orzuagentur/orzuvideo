import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteObject, objectSizeBytes, r2Bucket, r2Configured } from "@/lib/r2";
import { playableObjectUrl } from "@/lib/media-url";

export const runtime = "nodejs";

/**
 * List music tracks (own library).
 * Query: genre_id?, mood?, q?, page?
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const genreId = (url.searchParams.get("genre_id") || "").trim();
  const mood = (url.searchParams.get("mood") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") || 50)),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const selectWithSize =
    "id,title,artist,mood,duration_sec,storage_path,storage_bucket,public_url,genre_id,file_hash,file_size_bytes,created_at,music_genres(id,name,slug)";
  const selectBare =
    "id,title,artist,mood,duration_sec,storage_path,storage_bucket,public_url,genre_id,created_at,music_genres(id,name,slug)";

  let query = supabase
    .from("music_tracks")
    .select(selectWithSize, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (genreId) query = query.eq("genre_id", genreId);
  if (mood) query = query.ilike("mood", `%${mood}%`);
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,artist.ilike.%${q}%,mood.ilike.%${q}%`,
    );
  }

  let { data, error, count } = await query;
  if (error && /file_size_bytes|file_hash/i.test(error.message)) {
    let fallback = supabase
      .from("music_tracks")
      .select(selectBare, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (genreId) fallback = fallback.eq("genre_id", genreId);
    if (mood) fallback = fallback.ilike("mood", `%${mood}%`);
    if (q) {
      fallback = fallback.or(
        `title.ilike.%${q}%,artist.ilike.%${q}%,mood.ilike.%${q}%`,
      );
    }
    const again = await fallback;
    data = again.data as typeof data;
    error = again.error;
    count = again.count;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];

  // Backfill missing sizes from R2 (old uploads / before migration 019)
  if (r2Configured()) {
    const needSize = rows.filter(
      (r) =>
        r.storage_path &&
        ((r as { file_size_bytes?: number | null }).file_size_bytes == null ||
          Number((r as { file_size_bytes?: number | null }).file_size_bytes) <=
            0),
    );
    await Promise.all(
      needSize.slice(0, 40).map(async (r) => {
        const size = await objectSizeBytes(r.storage_path);
        if (size == null) return;
        (r as { file_size_bytes?: number }).file_size_bytes = size;
        void supabase
          .from("music_tracks")
          .update({ file_size_bytes: size })
          .eq("id", r.id)
          .eq("user_id", user.id);
      }),
    );
  }

  const items = await Promise.all(
    rows.map(async (row) => {
      const g = row.music_genres as
        | { id: string; name: string; slug: string }
        | { id: string; name: string; slug: string }[]
        | null;
      const genre = Array.isArray(g) ? g[0] : g;
      const playUrl = await playableObjectUrl(row.storage_path, row.public_url);
      return {
        id: row.id,
        title: row.title,
        artist: row.artist,
        mood: row.mood,
        durationSec: row.duration_sec,
        storagePath: row.storage_path,
        storageBucket: row.storage_bucket,
        publicUrl: row.public_url,
        genreId: row.genre_id,
        genreName: genre?.name || null,
        genreSlug: genre?.slug || null,
        fileSizeBytes: Number(
          (row as { file_size_bytes?: number | null }).file_size_bytes || 0,
        ),
        createdAt: row.created_at,
        previewUrl: playUrl,
        downloadUrl: playUrl,
      };
    }),
  );

  return NextResponse.json({
    items,
    total: count ?? items.length,
    page,
    pageSize,
    hasMore: (count ?? 0) > to + 1,
  });
}

/**
 * Register a track after R2 upload (presign).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!r2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title || "").trim().slice(0, 200);
  const artist = String(body.artist || "").trim().slice(0, 200);
  const mood = String(body.mood || "").trim().slice(0, 120);
  const genreId = String(body.genre_id || "").trim();
  const storagePath = String(body.storage_path || body.key || "")
    .trim()
    .replace(/^\/+/, "");
  const publicUrl = String(body.public_url || "").trim() || null;
  const durationRaw = body.duration_sec ?? body.durationSec;
  const durationSec =
    durationRaw != null && Number.isFinite(Number(durationRaw))
      ? Math.max(0, Math.round(Number(durationRaw)))
      : null;

  const fileHash = String(body.file_hash || body.fileHash || "")
    .trim()
    .toLowerCase();
  const fileSizeRaw = body.file_size_bytes ?? body.fileSizeBytes;
  const fileSizeBytes =
    fileSizeRaw != null && Number.isFinite(Number(fileSizeRaw))
      ? Math.max(0, Math.round(Number(fileSizeRaw)))
      : null;

  if (!title || !genreId || !storagePath) {
    return NextResponse.json(
      { error: "title, genre_id, storage_path required" },
      { status: 400 },
    );
  }
  if (!storagePath.startsWith(`${user.id}/music/`)) {
    return NextResponse.json(
      { error: "Invalid storage path — must be under your music folder" },
      { status: 400 },
    );
  }

  if (fileHash) {
    const { data: dup } = await supabase
      .from("music_tracks")
      .select("id")
      .eq("user_id", user.id)
      .eq("file_hash", fileHash)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { ok: false, duplicate: true, item: dup },
        { status: 409 },
      );
    }
  }

  const { data: genre, error: gErr } = await supabase
    .from("music_genres")
    .select("id")
    .eq("id", genreId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (gErr || !genre) {
    return NextResponse.json({ error: "Genre not found" }, { status: 400 });
  }

  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    genre_id: genreId,
    title,
    artist,
    mood,
    duration_sec: durationSec,
    storage_path: storagePath,
    storage_bucket: r2Bucket(),
    public_url: publicUrl,
  };
  if (fileHash) insertRow.file_hash = fileHash;
  if (fileSizeBytes != null) insertRow.file_size_bytes = fileSizeBytes;

  let { data, error } = await supabase
    .from("music_tracks")
    .insert(insertRow)
    .select(
      "id,title,artist,mood,duration_sec,storage_path,storage_bucket,public_url,genre_id,file_hash,file_size_bytes,created_at",
    )
    .single();

  if (error && /file_size_bytes|file_hash/i.test(error.message)) {
    const basic = { ...insertRow };
    delete basic.file_hash;
    delete basic.file_size_bytes;
    const again = await supabase
      .from("music_tracks")
      .insert(basic)
      .select(
        "id,title,artist,mood,duration_sec,storage_path,storage_bucket,public_url,genre_id,created_at",
      )
      .single();
    data = again.data as typeof data;
    error = again.error;
  }

  if (error) {
    if (String(error.message).includes("music_tracks_user_hash")) {
      return NextResponse.json(
        { ok: false, duplicate: true },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}

/** Delete track from DB + R2. ?id= */
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

  const { data: row, error: fetchErr } = await supabase
    .from("music_tracks")
    .select("id,storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (r2Configured() && row.storage_path) {
    try {
      await deleteObject(row.storage_path);
    } catch (e) {
      console.error("[music DELETE] R2:", e);
    }
  }

  const { error } = await supabase
    .from("music_tracks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
