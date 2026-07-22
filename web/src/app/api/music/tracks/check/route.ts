import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Batch check which content hashes already exist for this user.
 * POST { hashes: string[] } → { existing: string[] }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { hashes?: unknown };
  try {
    body = (await request.json()) as { hashes?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hashes = Array.isArray(body.hashes)
    ? [...new Set(body.hashes.map((h) => String(h || "").trim().toLowerCase()).filter(Boolean))]
    : [];

  if (!hashes.length) {
    return NextResponse.json({ existing: [] as string[] });
  }
  if (hashes.length > 500) {
    return NextResponse.json({ error: "Max 500 hashes per request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("music_tracks")
    .select("file_hash")
    .eq("user_id", user.id)
    .in("file_hash", hashes);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existing = (data || [])
    .map((r) => String(r.file_hash || "").toLowerCase())
    .filter(Boolean);

  return NextResponse.json({ existing });
}
