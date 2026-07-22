import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  POLYHAVEN_API,
  POLYHAVEN_UA,
  buildPreviewSides,
  listPackages,
  parseAssetEntry,
  type PolyHavenType,
} from "@/lib/polyhaven";

export const runtime = "nodejs";

/**
 * Files + packages + preview sides for one Poly Haven asset.
 * Query: id=
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!id || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  }

  try {
    const [infoRes, filesRes] = await Promise.all([
      fetch(`${POLYHAVEN_API}/info/${encodeURIComponent(id)}`, {
        headers: { "User-Agent": POLYHAVEN_UA, Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
      fetch(`${POLYHAVEN_API}/files/${encodeURIComponent(id)}`, {
        headers: { "User-Agent": POLYHAVEN_UA, Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
    ]);

    if (!infoRes.ok) {
      return NextResponse.json(
        { error: `Asset not found (${infoRes.status})` },
        { status: infoRes.status === 404 ? 404 : 502 },
      );
    }
    if (!filesRes.ok) {
      return NextResponse.json(
        { error: `Files unavailable (${filesRes.status})` },
        { status: 502 },
      );
    }

    const info = (await infoRes.json()) as Record<string, unknown>;
    const files = (await filesRes.json()) as Record<string, unknown>;
    const asset = parseAssetEntry(id, info);
    const type = asset.type as Exclude<PolyHavenType, "all">;
    const packages = listPackages(files, type);
    const sides = buildPreviewSides(asset, files);

    return NextResponse.json({
      asset,
      packages,
      sides,
      attribution: {
        provider: "Poly Haven",
        license: "CC0",
        licenseUrl: "https://polyhaven.com/license",
        siteUrl: asset.pageUrl,
      },
    });
  } catch (e) {
    console.error("[polyhaven/files]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Poly Haven unavailable" },
      { status: 502 },
    );
  }
}
