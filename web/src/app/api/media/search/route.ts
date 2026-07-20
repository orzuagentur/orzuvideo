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
        author: v.user?.name || "Pexels",
        thumb:
          v.image ||
          v.video_pictures?.[0]?.picture ||
          null,
        previewUrl,
        downloadUrl,
        durationSec: v.duration ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
        pageUrl: v.url || null,
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
      author: p.photographer || "Pexels",
      thumb: p.src?.medium || p.src?.large || null,
      previewUrl: p.src?.large2x || p.src?.large || p.src?.original || null,
      downloadUrl: p.src?.original || p.src?.large2x || null,
      durationSec: null,
      width: p.width ?? null,
      height: p.height ?? null,
      pageUrl: p.url || null,
      downloadAllowed: Boolean(p.src?.original || p.src?.large2x),
    }),
  );
  return { items, total: Number(data.total_results || items.length) };
}

async function searchJamendo(
  clientId: string,
  q: string,
  page: number,
): Promise<{ items: MediaCard[]; total: number }> {
  const offset = String((page - 1) * PAGE_SIZE);
  const base = {
    client_id: clientId,
    format: "json",
    limit: String(PAGE_SIZE),
    offset,
    audioformat: "mp32",
    audiodlformat: "mp32",
    include: "musicinfo",
    order: "popularity_total",
  };

  const cleaned = q.trim();
  // Jamendo `search=` often returns 0 for short mood words like "epic".
  // Try several strategies until we get tracks.
  const strategies: Record<string, string>[] = cleaned
    ? [
        { search: cleaned },
        { fuzzytags: cleaned, vocalinstrumental: "instrumental" },
        { tags: cleaned.replace(/\s+/g, "+"), vocalinstrumental: "instrumental" },
        { tags: "soundtrack", vocalinstrumental: "instrumental" },
      ]
    : [
        { tags: "soundtrack", vocalinstrumental: "instrumental" },
        { order: "popularity_total", vocalinstrumental: "instrumental" },
      ];

  let results: unknown[] = [];
  let fullcount = 0;

  for (const strategy of strategies) {
    const params = new URLSearchParams({ ...base, ...strategy });
    // Prefer strategy order over base when strategy sets order
    const res = await fetch(
      `https://api.jamendo.com/v3.0/tracks/?${params}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    const headers = data.headers || {};
    if (String(headers.code ?? "0") !== "0") {
      continue;
    }
    const batch = data.results || [];
    if (batch.length > 0) {
      results = batch;
      fullcount = Number(headers.results_fullcount || batch.length);
      break;
    }
  }

  const items: MediaCard[] = (results as {
    id: string | number;
    name?: string;
    artist_name?: string;
    image?: string;
    audio?: string;
    audiodownload?: string;
    audiodownload_allowed?: boolean;
    duration?: number;
    shareurl?: string;
  }[]).map((t) => {
    const downloadUrl = t.audiodownload || t.audio || null;
    return {
      id: String(t.id),
      kind: "music" as const,
      title: t.name || `Track #${t.id}`,
      author: t.artist_name || "Jamendo",
      thumb: t.image || null,
      previewUrl: t.audio || t.audiodownload || null,
      downloadUrl,
      durationSec: t.duration ?? null,
      width: null,
      height: null,
      pageUrl: t.shareurl || null,
      downloadAllowed: Boolean(
        t.audiodownload_allowed !== false && downloadUrl,
      ),
    };
  });

  return {
    items,
    total: fullcount || items.length,
  };
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

/** Search stock media via Pexels / Jamendo. Does not touch our DB. */
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

  try {
    if (kind === "all") {
      const pexelsKey = process.env.PEXELS_API_KEY;
      const jamendoId = process.env.JAMENDO_CLIENT_ID;
      const take = 12;
      const empty = { items: [] as MediaCard[], total: 0 };
      // High page numbers often return empty from Pexels while Jamendo still
      // has tracks — clamp and fall back so refresh stays mixed.
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
      const musicQ = q.trim() || "soundtrack";

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
        jamendoId
          ? withPageFallback((p) => searchJamendo(jamendoId, musicQ, p))
          : Promise.resolve(empty),
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
        items: mixed,
        total:
          Number(videos.total || 0) +
          Number(photos.total || 0) +
          Number(tracks.total || 0),
        page: safePage,
        pageSize,
        hasMore: more,
        provider: "mixed",
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
          { error: "PEXELS_API_KEY is not configured" },
          { status: 500 },
        );
      }
      const result =
        kind === "video"
          ? await searchPexelsVideos(key, q, page, orientation)
          : await searchPexelsPhotos(key, q, page, orientation);
      return NextResponse.json({
        items: result.items,
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: result.items.length >= PAGE_SIZE,
        provider: "pexels",
      });
    }

    if (kind === "music") {
      const clientId = process.env.JAMENDO_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json(
          { error: "JAMENDO_CLIENT_ID is not configured" },
          { status: 500 },
        );
      }
      const result = await searchJamendo(clientId, q, page);
      return NextResponse.json({
        items: result.items,
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: result.items.length >= PAGE_SIZE,
        provider: "jamendo",
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
