import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const heygen_avatar_id = String(body.heygen_avatar_id || "").trim();
  if (!heygen_avatar_id) {
    return NextResponse.json({ error: "heygen_avatar_id required" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    heygen_avatar_id,
    heygen_avatar_name: String(body.heygen_avatar_name || "").trim() || null,
    heygen_background_mode: String(body.heygen_background_mode || "rotate"),
    heygen_background_url: String(body.heygen_background_url || "").trim() || null,
    avatar_image_url: String(body.avatar_image_url || "").trim() || null,
    visual_mode: String(body.visual_mode || "heygen"),
    is_trained: true,
  };

  // Upsert training row; keep existing style fields if present
  const { data: existing } = await supabase
    .from("instagram_training")
    .select("style_prompt, niche")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("instagram_training").upsert(
    {
      ...payload,
      niche: existing?.niche || "lifestyle",
      style_prompt:
        existing?.style_prompt ||
        "Friendly talking-head creator for Instagram Reels.",
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
