import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Look = {
  id: string;
  name: string;
  preview_image_url: string | null;
  preview_video_url: string | null;
  gender: string | null;
  avatar_type: string | null;
  source: string;
};

/**
 * List HeyGen avatars / photo avatars / looks for the Avatar picker.
 * Surfaces API errors so missing key / bad key is obvious in the UI.
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
      {
        error:
          "HEYGEN_API_KEY missing in web env. Add it to Vercel + .env.local, then redeploy.",
        avatars: [],
        diagnostics: [],
      },
      { status: 500 },
    );
  }

  const headers = {
    "X-Api-Key": key,
    Accept: "application/json",
  };

  const looks: Look[] = [];
  const seen = new Set<string>();
  const diagnostics: string[] = [];

  function push(raw: Record<string, unknown>, source: string) {
    const id = String(
      raw.avatar_id ||
        raw.talking_photo_id ||
        raw.id ||
        raw.avatar_look_id ||
        "",
    ).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    looks.push({
      id,
      name: String(
        raw.avatar_name || raw.talking_photo_name || raw.name || id,
      ),
      preview_image_url: (raw.preview_image_url ||
        raw.preview_image ||
        raw.image_url ||
        raw.thumbnail_url ||
        null) as string | null,
      preview_video_url: (raw.preview_video_url || null) as string | null,
      gender: (raw.gender || null) as string | null,
      avatar_type: (raw.avatar_type || raw.type || source) as string | null,
      source,
    });
  }

  async function tryFetch(label: string, url: string, extract: (data: unknown) => unknown[]) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        diagnostics.push(`${label}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 180)}`);
        return;
      }
      const list = extract(data);
      if (!Array.isArray(list) || list.length === 0) {
        diagnostics.push(`${label}: 0 items`);
        return;
      }
      for (const item of list) push(item as Record<string, unknown>, label);
      diagnostics.push(`${label}: +${list.length}`);
    } catch (e) {
      diagnostics.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  await tryFetch("v2/avatars", "https://api.heygen.com/v2/avatars", (data) => {
    const d = data as { data?: { avatars?: unknown[]; avatar_list?: unknown[] }; avatars?: unknown[] };
    return d?.data?.avatars || d?.data?.avatar_list || d?.avatars || [];
  });

  await tryFetch(
    "v1/talking_photo.list",
    "https://api.heygen.com/v1/talking_photo.list",
    (data) => {
      const d = data as {
        data?: { talking_photos?: unknown[]; photo_avatar_list?: unknown[] };
      };
      return d?.data?.talking_photos || d?.data?.photo_avatar_list || [];
    },
  );

  await tryFetch(
    "v2/photo_avatar",
    "https://api.heygen.com/v2/avatar_group.list?include_public=false",
    (data) => {
      const d = data as { data?: { avatar_group_list?: unknown[] } };
      return d?.data?.avatar_group_list || [];
    },
  );

  // Expand photo avatar groups into looks
  const groupIds = looks
    .filter((l) => l.source === "v2/photo_avatar")
    .map((l) => l.id)
    .slice(0, 20);
  for (const gid of groupIds) {
    await tryFetch(
      `group/${gid}`,
      `https://api.heygen.com/v2/avatar_group/${gid}/avatars`,
      (data) => {
        const d = data as {
          data?: { avatar_list?: unknown[]; avatars?: unknown[] };
        };
        return d?.data?.avatar_list || d?.data?.avatars || [];
      },
    );
  }

  for (const ownership of ["private", "public"] as const) {
    await tryFetch(
      `v3/looks/${ownership}`,
      `https://api.heygen.com/v3/avatars/looks?ownership=${ownership}&limit=50`,
      (data) => {
        const d = data as {
          data?: { avatar_looks?: unknown[]; looks?: unknown[] } | unknown[];
        };
        if (Array.isArray(d?.data)) return d.data;
        const obj = d?.data as { avatar_looks?: unknown[]; looks?: unknown[] };
        return obj?.avatar_looks || obj?.looks || [];
      },
    );
  }

  // Prefer private / talking photos first in UI
  looks.sort((a, b) => {
    const rank = (s: string) =>
      s.includes("talking") || s.includes("private") || s.includes("group/")
        ? 0
        : s.includes("v2/avatars")
          ? 1
          : 2;
    return rank(a.source) - rank(b.source);
  });

  return NextResponse.json({
    ok: true,
    count: looks.length,
    avatars: looks,
    diagnostics,
    hint:
      looks.length === 0
        ? "No avatars returned. Check HEYGEN_API_KEY on Vercel, create a Photo Avatar in HeyGen, then Refresh."
        : undefined,
  });
}
