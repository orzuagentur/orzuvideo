import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type MediaKind = "video" | "photo" | "music" | "all";

type MediaCard = {
  id: string;
  kind: MediaKind;
  title: string;
  author: string;
  thumb: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  pageUrl: string | null;
  downloadAllowed: boolean;
  /** Own library extras */
  genre?: string | null;
  mood?: string | null;
  genreId?: string | null;
};

function bestVideoFile(files: { link?: string; width?: number; height?: number; quality?: string }[]) {
  const ranked = [...files].sort((a, b) => {
    const aw = a.width || 0;
    const bw = b.width || 0;
    // Prefer HD-ish without going huge
    const ascore = Math.abs(aw - 1280);
    const bscore = Math.abs(bw - 1280);
    return ascore - bscore;
  });
  return ranked.find((f) => f.link)?.link || null;
}

/** Smallest usable file for muted hover preview (avoids loading HD on every card). */
function lightVideoFile(files: { link?: string; width?: number; height?: number }[]) {
  const withLink = files.filter((f) => f.link);
  if (!withLink.length) return null;
  const ranked = [...withLink].sort((a, b) => {
    const aw = a.width || 99999;
    const bw = b.width || 99999;
    // Prefer ~480px wide; avoid tiny unusable + huge HD
    const score = (w: number) => (w < 320 ? 10000 + w : Math.abs(w - 480));
    return score(aw) - score(bw);
  });
  return ranked[0]?.link || null;
}

const PAGE_SIZE = 40;

/** Hide upstream CDN / catalog URLs from the client — serve via our download proxy only. */
function sanitizeClientMedia(items: MediaCard[]): MediaCard[] {
  return items.map((it) => {
    const type =
      it.kind === "photo" ? "photo" : it.kind === "music" ? "music" : "video";
    const ext = type === "photo" ? "jpg" : type === "music" ? "mp3" : "mp4";
    const wrap = (url: string | null, inline: boolean, name: string) => {
      if (!url) return null;
      if (url.startsWith("/api/")) return url;
      const params = new URLSearchParams({
        url,
        type,
        filename: name,
      });
      if (inline) params.set("inline", "1");
      return `/api/media/download?${params}`;
    };
    return {
      ...it,
      pageUrl: null,
      thumb: wrap(it.thumb, true, `stock-${it.id}-thumb.${ext === "mp3" ? "jpg" : ext === "mp4" ? "jpg" : ext}`),
      previewUrl: wrap(
        it.previewUrl,
        true,
        `stock-${it.id}-preview.${ext}`,
      ),
      downloadUrl: wrap(it.downloadUrl, false, `stock-${it.id}.${ext}`),
    };
  });
}

async function searchPexelsVideos(
  key: string,
  q: string,
  page: number,
  orientation: string,
): Promise<{ items: MediaCard[]; total: number }> {
  const params = new URLSearchParams({
    query: q || "nature",
    per_page: String(PAGE_SIZE),
    page: String(page),
  });
  if (orientation && orientation !== "all") {
    params.set("orientation", orientation);
  }
  const res = await fetch(
    `https://api.pexels.com/videos/search?${params}`,
    { headers: { Authorization: key }, cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.status || "Pexels video search failed");
  }
  const items: MediaCard[] = (data.videos || []).map(
    (v: {
      id: number;
      width?: number;
      height?: number;
      duration?: number;
      image?: string;
      url?: string;
      user?: { name?: string };
      video_files?: { link?: string; width?: number; height?: number }[];
      video_pictures?: { picture?: string }[];
    }) => {
      const downloadUrl = bestVideoFile(v.video_files || []);
      const previewUrl = lightVideoFile(v.video_files || []) || downloadUrl;
      return {
        id: String(v.id),
        kind: "video" as const,
        title: `Video #${v.id}`,
        author: v.user?.name || "Stock",
        thumb:
          v.image ||
          v.video_pictures?.[0]?.picture ||
          null,
        previewUrl,
        downloadUrl,
        durationSec: v.duration ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
        pageUrl: null,
        downloadAllowed: Boolean(downloadUrl),
      };
    },
  );
  return { items, total: Number(data.total_results || items.length) };
}

async function searchPexelsPhotos(
  key: string,
  q: string,
  page: number,
  orientation: string,
): Promise<{ items: MediaCard[]; total: number }> {
  const params = new URLSearchParams({
    query: q || "nature",
    per_page: String(PAGE_SIZE),
    page: String(page),
  });
  if (orientation && orientation !== "all") {
    params.set("orientation", orientation);
  }
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: key },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.status || "Pexels photo search failed");
  }
  const items: MediaCard[] = (data.photos || []).map(
    (p: {
      id: number;
      width?: number;
      height?: number;
      alt?: string;
      url?: string;
      photographer?: string;
      src?: {
        medium?: string;
        large?: string;
        large2x?: string;
        original?: string;
      };
    }) => ({
      id: String(p.id),
      kind: "photo" as const,
      title: p.alt || `Photo #${p.id}`,
      author: p.photographer || "Stock",
      thumb: p.src?.medium || p.src?.large || null,
      previewUrl: p.src?.large2x || p.src?.large || p.src?.original || null,
      downloadUrl: p.src?.original || p.src?.large2x || null,
      durationSec: null,
      width: p.width ?? null,
      height: p.height ?? null,
      pageUrl: null,
      downloadAllowed: Boolean(p.src?.original || p.src?.large2x),
    }),
  );
  return { items, total: Number(data.total_results || items.length) };
}

async function searchLibraryMusic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  q: string,
  page: number,
  genreId: string,
): Promise<{ items: MediaCard[]; total: number }> {
  const pageSize = PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("music_tracks")
    .select(
      "id,title,artist,mood,duration_sec,public_url,genre_id,music_genres(name)",
      { count: "exact" },
    )
    .eq("is_platform", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (genreId) query = query.eq("genre_id", genreId);
  const cleaned = q.trim();
  if (cleaned) {
    query = query.or(
      `title.ilike.%${cleaned}%,artist.ilike.%${cleaned}%,mood.ilike.%${cleaned}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items: MediaCard[] = (data || []).map((t) => {
    const g = t.music_genres as
      | { name?: string }
      | { name?: string }[]
      | null;
    const genreName = Array.isArray(g) ? g[0]?.name : g?.name;
    return {
      id: String(t.id),
      kind: "music" as const,
      title: t.title || "Track",
      author: t.artist || "—",
      thumb: null,
      previewUrl: t.public_url || null,
      downloadUrl: t.public_url || null,
      durationSec: t.duration_sec ?? null,
      width: null,
      height: null,
      pageUrl: null,
      downloadAllowed: Boolean(t.public_url),
      genre: genreName || null,
      mood: t.mood || null,
      genreId: t.genre_id || null,
    };
  });

  return { items, total: count ?? items.length };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Search Pexels (video/photo) + own R2 music library. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const kind = (url.searchParams.get("type") || "all") as MediaKind;
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const orientation = url.searchParams.get("orientation") || "all";
  const genreId = (url.searchParams.get("genre_id") || "").trim();

  try {
    if (kind === "all") {
      const pexelsKey = process.env.PEXELS_API_KEY;
      const take = 12;
      const empty = { items: [] as MediaCard[], total: 0 };
      const safePage = Math.min(Math.max(1, page), 12);

      async function withPageFallback(
        run: (p: number) => Promise<{ items: MediaCard[]; total: number }>,
      ) {
        try {
          const first = await run(safePage);
          if (first.items.length > 0) return first;
          if (safePage !== 1) return run(1);
          return first;
        } catch {
          try {
            return await run(1);
          } catch {
            return empty;
          }
        }
      }

      const videoQ = q.trim() || "cinematic";
      const photoQ = q.trim() || "nature";

      const [videos, photos, tracks] = await Promise.all([
        pexelsKey
          ? withPageFallback((p) =>
              searchPexelsVideos(pexelsKey, videoQ, p, orientation),
            )
          : Promise.resolve(empty),
        pexelsKey
          ? withPageFallback((p) =>
              searchPexelsPhotos(pexelsKey, photoQ, p, orientation),
            )
          : Promise.resolve(empty),
        withPageFallback((p) =>
          searchLibraryMusic(supabase, user.id, q, p, genreId),
        ),
      ]);

      const mixed = seededShuffle(
        [
          ...videos.items.slice(0, take),
          ...photos.items.slice(0, take),
          ...tracks.items.slice(0, take),
        ],
        url.searchParams.get("seed") || `${q}|${safePage}|${orientation}`,
      );
      const pageSize = take * 3;
      const more =
        videos.items.length >= take ||
        photos.items.length >= take ||
        tracks.items.length >= take;

      return NextResponse.json({
        items: sanitizeClientMedia(mixed),
        total:
          Number(videos.total || 0) +
          Number(photos.total || 0) +
          Number(tracks.total || 0),
        page: safePage,
        pageSize,
        hasMore: more,
        counts: {
          video: videos.items.length,
          photo: photos.items.length,
          music: tracks.items.length,
        },
      });
    }

    if (kind === "video" || kind === "photo") {
      const key = process.env.PEXELS_API_KEY;
      if (!key) {
        return NextResponse.json(
          { error: "Media search is not configured" },
          { status: 500 },
        );
      }
      const result =
        kind === "video"
          ? await searchPexelsVideos(key, q, page, orientation)
          : await searchPexelsPhotos(key, q, page, orientation);
      return NextResponse.json({
        items: sanitizeClientMedia(result.items),
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: result.items.length >= PAGE_SIZE,
      });
    }

    if (kind === "music") {
      const result = await searchLibraryMusic(
        supabase,
        user.id,
        q,
        page,
        genreId,
      );
      return NextResponse.json({
        items: sanitizeClientMedia(result.items),
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: result.items.length >= PAGE_SIZE,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 500 },
    );
  }
}
