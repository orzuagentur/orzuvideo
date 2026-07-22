import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const KINDS = new Set(["video", "photo", "music"]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kind = (searchParams.get("kind") || "all").trim().toLowerCase();

  let q = supabase
    .from("media_favorites")
    .select(
      "id,kind,asset_id,title,author,thumb,preview_url,download_url,duration_sec,width,height,created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (kind !== "all" && KINDS.has(kind)) {
    q = q.eq("kind", kind);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(request: Request) {
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

  const kind = String(body.kind || "").trim().toLowerCase();
  const asset_id = String(body.asset_id || body.id || "").trim();
  if (!KINDS.has(kind) || !asset_id) {
    return NextResponse.json(
      { error: "kind and asset_id required" },
      { status: 400 },
    );
  }

  const row = {
    user_id: user.id,
    kind,
    asset_id,
    title: String(body.title || "").trim().slice(0, 200) || null,
    author: String(body.author || "").trim().slice(0, 200) || null,
    thumb: String(body.thumb || "").trim() || null,
    preview_url: String(body.preview_url || body.previewUrl || "").trim() || null,
    download_url:
      String(body.download_url || body.downloadUrl || "").trim() || null,
    duration_sec:
      body.duration_sec != null || body.durationSec != null
        ? Number(body.duration_sec ?? body.durationSec)
        : null,
    width: body.width != null ? Number(body.width) : null,
    height: body.height != null ? Number(body.height) : null,
    page_url: null,
    meta: {},
  };

  const { data, error } = await supabase
    .from("media_favorites")
    .upsert(row, { onConflict: "user_id,kind,asset_id" })
    .select("id,kind,asset_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kind = (searchParams.get("kind") || "").trim().toLowerCase();
  const asset_id = (searchParams.get("asset_id") || "").trim();
  if (!KINDS.has(kind) || !asset_id) {
    return NextResponse.json(
      { error: "kind and asset_id required" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("media_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("asset_id", asset_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
