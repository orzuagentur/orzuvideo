import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  publicObjectUrl,
  r2Bucket,
  r2Configured,
  signedPutUrl,
} from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "application/octet-stream",
]);

/**
 * Presigned PUT for direct browser → Cloudflare R2 uploads.
 * Key must start with `{userId}/`.
 */
export async function POST(request: Request) {
  if (!r2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured on the server" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = String(body.key || "").trim().replace(/^\/+/, "");
  const contentType = String(body.contentType || "application/octet-stream")
    .trim()
    .toLowerCase();
  const contentLength = Number(body.contentLength || 0);

  if (!key || !key.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: "Invalid key — must be under your user folder" },
      { status: 400 },
    );
  }
  if (key.includes("..") || key.length > 512) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(contentType) && !contentType.startsWith("video/")) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 400 },
    );
  }
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 500 MB)" },
      { status: 400 },
    );
  }

  try {
    const uploadUrl = await signedPutUrl(key, contentType, 60 * 60);
    return NextResponse.json({
      uploadUrl,
      publicUrl: publicObjectUrl(key),
      bucket: r2Bucket(),
      key,
      expiresIn: 3600,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Presign failed" },
      { status: 500 },
    );
  }
}
