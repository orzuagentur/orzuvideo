import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_HOSTS = [
  "videos.pexels.com",
  "images.pexels.com",
  "www.pexels.com",
  "player.vimeo.com",
  "vimeo.com",
  "i.vimeocdn.com",
  "vod-progressive.akamaized.net",
  "mp3d.jamendo.com",
  "mp3l.jamendo.com",
  "storage.jamendo.com",
  "imgjam.com",
  "api.jamendo.com",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

function safeFilename(name: string, fallback: string) {
  const cleaned = name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120);
  return cleaned || fallback;
}

/**
 * Proxy download to the user's device only.
 * Does not save files to our storage or database.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const fileUrl = url.searchParams.get("url");
  const filename = url.searchParams.get("filename") || "download";
  const type = url.searchParams.get("type") || "bin";

  if (!fileUrl || !isAllowedUrl(fileUrl)) {
    return NextResponse.json({ error: "Invalid or blocked URL" }, { status: 400 });
  }

  try {
    const upstream = await fetch(fileUrl, {
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": "OrzuAi/1.0" },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType =
      upstream.headers.get("content-type") ||
      (type === "video"
        ? "video/mp4"
        : type === "photo"
          ? "image/jpeg"
          : type === "music"
            ? "audio/mpeg"
            : "application/octet-stream");

    const ext =
      type === "video"
        ? ".mp4"
        : type === "photo"
          ? ".jpg"
          : type === "music"
            ? ".mp3"
            : "";
    const name = safeFilename(
      filename.endsWith(ext) ? filename : `${filename}${ext}`,
      `orzu-media${ext}`,
    );

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 500 },
    );
  }
}
