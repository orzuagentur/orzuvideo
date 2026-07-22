import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  POLYHAVEN_API,
  POLYHAVEN_UA,
  fetchPolyHavenAssets,
  parseAssetEntry,
  thumbUrl,
  type PolyHavenType,
} from "@/lib/polyhaven";

export const runtime = "nodejs";

/**
 * Categories for a Poly Haven asset type (+ thumbs).
 * Query: type=models|hdris|textures
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const typeRaw = (
    new URL(request.url).searchParams.get("type") || "models"
  ).toLowerCase();
  const type: Exclude<PolyHavenType, "all"> =
    typeRaw === "hdris" || typeRaw === "textures" ? typeRaw : "models";

  try {
    const [catRes, assetsRaw] = await Promise.all([
      fetch(`${POLYHAVEN_API}/categories/${encodeURIComponent(type)}`, {
        headers: {
          "User-Agent": POLYHAVEN_UA,
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
      }),
      fetchPolyHavenAssets(type),
    ]);

    if (!catRes.ok) {
      return NextResponse.json(
        { error: `Poly Haven categories ${catRes.status}` },
        { status: 502 },
      );
    }

    const data = (await catRes.json()) as Record<string, number>;

    const thumbByCat = new Map<string, string>();
    for (const [id, meta] of Object.entries(assetsRaw)) {
      const asset = parseAssetEntry(
        id,
        (meta || {}) as Record<string, unknown>,
      );
      for (const c of asset.categories) {
        const key = c.toLowerCase();
        if (!thumbByCat.has(key)) {
          thumbByCat.set(key, asset.primaryUrl || asset.thumbUrl || thumbUrl(id));
        }
      }
    }

    const items = Object.entries(data)
      .filter(([slug]) => slug !== "all")
      .map(([slug, count]) => ({
        id: slug,
        label: slug
          .replace(/^collection:\s*/i, "")
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        count: Number(count) || 0,
        collection: /^collection:/i.test(slug),
        thumbUrl: thumbByCat.get(slug.toLowerCase()) || null,
      }))
      .sort((a, b) => {
        if (a.collection !== b.collection) return a.collection ? 1 : -1;
        return b.count - a.count;
      });

    return NextResponse.json({
      type,
      items,
      total: Number(data.all || 0),
    });
  } catch (e) {
    console.error("[polyhaven/categories]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Poly Haven unavailable" },
      { status: 502 },
    );
  }
}
