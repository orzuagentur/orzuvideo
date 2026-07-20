import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Media library for AI Clipping — same Pexels videos as the Media page,
 * loaded only through our /api/media/search proxy.
 * ?q=  &page=  &orientation=
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim() || "cinematic";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const orientation = (searchParams.get("orientation") || "all").trim();

  const cookie = request.headers.get("cookie") || "";
  const origin = new URL(request.url).origin;
  const url = new URL("/api/media/search", origin);
  url.searchParams.set("type", "video");
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  if (orientation) url.searchParams.set("orientation", orientation);

  const res = await fetch(url.toString(), {
    headers: { cookie },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error || "Media search failed" },
      { status: res.status },
    );
  }

  const items = (data.items || [])
    .filter((it: { kind?: string }) => it.kind === "video")
    .map(
      (it: {
        id: string;
        title: string;
        author?: string;
        thumb?: string | null;
        previewUrl?: string | null;
        downloadUrl?: string | null;
        durationSec?: number | null;
        width?: number | null;
        height?: number | null;
      }) => {
        const thumbProxy = it.thumb
          ? `/api/media/download?inline=1&type=photo&url=${encodeURIComponent(it.thumb)}&filename=${encodeURIComponent(`pexels-${it.id}.jpg`)}`
          : null;
        const previewProxy = it.previewUrl
          ? `/api/media/download?inline=1&type=video&url=${encodeURIComponent(it.previewUrl)}&filename=${encodeURIComponent(`pexels-${it.id}.mp4`)}`
          : null;
        return {
          id: String(it.id),
          title: it.title || `Video #${it.id}`,
          author: it.author || "",
          kind: "media" as const,
          provider: "pexels",
          media_url: previewProxy,
          thumb_url: thumbProxy,
          download_url: it.downloadUrl || it.previewUrl || null,
          duration_seconds: it.durationSec ?? null,
          width: it.width ?? null,
          height: it.height ?? null,
        };
      },
    );

  return NextResponse.json({
    items,
    page: data.page ?? page,
    hasMore: Boolean(data.hasMore),
    total: data.total ?? items.length,
    provider: "pexels",
  });
}
