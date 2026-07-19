import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Look = {
  id: string;
  name: string;
  preview_image_url: string | null;
  preview_video_url: string | null;
  gender: string | null;
  avatar_type: string | null;
  source: "private" | "public" | "v2";
};

/**
 * List HeyGen avatar looks / styles for the Avatar picker.
 * Tries v2 list + v3 looks (private first).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = (process.env.HEYGEN_API_KEY || "").trim();
  if (!key) {
    return NextResponse.json(
      { error: "HEYGEN_API_KEY missing in web env (Vercel / .env.local)" },
      { status: 500 },
    );
  }

  const headers = {
    "X-Api-Key": key,
    Accept: "application/json",
  };

  const looks: Look[] = [];
  const seen = new Set<string>();

  function push(raw: Record<string, unknown>, source: Look["source"]) {
    const id = String(raw.avatar_id || raw.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    looks.push({
      id,
      name: String(raw.avatar_name || raw.name || id),
      preview_image_url: (raw.preview_image_url ||
        raw.preview_image ||
        raw.image_url ||
        null) as string | null,
      preview_video_url: (raw.preview_video_url || null) as string | null,
      gender: (raw.gender || null) as string | null,
      avatar_type: (raw.avatar_type || raw.type || null) as string | null,
      source,
    });
  }

  // 1) Classic v2 avatars (includes many studio + talking photo)
  try {
    const res = await fetch("https://api.heygen.com/v2/avatars", {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok) {
      const list =
        data?.data?.avatars ||
        data?.data?.avatar_list ||
        data?.avatars ||
        [];
      if (Array.isArray(list)) {
        for (const item of list) push(item as Record<string, unknown>, "v2");
      }
    }
  } catch (e) {
    console.warn("HeyGen v2 avatars failed", e);
  }

  // 2) Talking photos (photo avatars / styles user created)
  try {
    const res = await fetch("https://api.heygen.com/v2/avatars?avatar_type=talking_photo", {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok) {
      const list =
        data?.data?.avatars ||
        data?.data?.talking_photos ||
        data?.data?.avatar_list ||
        [];
      if (Array.isArray(list)) {
        for (const item of list) {
          const row = item as Record<string, unknown>;
          // talking_photo often uses talking_photo_id
          if (!row.avatar_id && row.talking_photo_id) {
            row.avatar_id = row.talking_photo_id;
          }
          push(row, "private");
        }
      }
    }
  } catch (e) {
    console.warn("HeyGen talking_photo list failed", e);
  }

  // 3) v3 looks — private styles
  for (const ownership of ["private", "public"] as const) {
    try {
      const res = await fetch(
        `https://api.heygen.com/v3/avatars/looks?ownership=${ownership}&limit=50`,
        { headers, cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) continue;
      const list = data?.data?.avatar_looks || data?.data?.looks || data?.data || [];
      if (Array.isArray(list)) {
        for (const item of list) push(item as Record<string, unknown>, ownership);
      }
    } catch (e) {
      console.warn(`HeyGen v3 looks ${ownership} failed`, e);
    }
  }

  return NextResponse.json({
    ok: true,
    count: looks.length,
    avatars: looks,
  });
}
