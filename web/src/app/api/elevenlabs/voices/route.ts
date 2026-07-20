import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type VoiceItem = {
  id: string;
  name: string;
  category: string | null;
  labels: string | null;
  gender: string | null;
  accent: string | null;
  age: string | null;
  preview_url: string | null;
  source: "account" | "shared";
};

function pickLabel(
  labels: Record<string, string> | undefined,
  key: string,
): string | null {
  if (!labels) return null;
  const v = labels[key] || labels[key.toLowerCase()];
  return v ? String(v) : null;
}

function normalizeGender(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const g = raw.toLowerCase();
  if (g.includes("female") || g === "f" || g === "woman") return "female";
  if (g.includes("male") || g === "m" || g === "man") return "male";
  if (g.includes("neutral") || g.includes("non")) return "neutral";
  return g;
}

/**
 * List ElevenLabs voices: account voices + shared library (paginated).
 * Query: ?q=&gender=male|female|neutral|all
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add ELEVENLABS_API_KEY to web/.env.local", voices: [] },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim().toLowerCase();
  const genderFilter = String(searchParams.get("gender") || "all")
    .trim()
    .toLowerCase();

  try {
    const headers = { "xi-api-key": apiKey };

    const accountRes = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers,
      next: { revalidate: 120 },
    });
    const accountData = await accountRes.json();
    if (!accountRes.ok) {
      return NextResponse.json(
        {
          error:
            accountData.detail?.message ||
            accountData.message ||
            "Failed to load voices",
          voices: [],
        },
        { status: 502 },
      );
    }

    const accountVoices: VoiceItem[] = (accountData.voices || []).map(
      (v: {
        voice_id: string;
        name?: string;
        category?: string;
        labels?: Record<string, string>;
        preview_url?: string;
      }) => {
        const gender = normalizeGender(pickLabel(v.labels, "gender"));
        const accent = pickLabel(v.labels, "accent");
        const age = pickLabel(v.labels, "age");
        const labelParts = [gender, accent, age, v.category].filter(Boolean);
        return {
          id: v.voice_id,
          name: v.name || v.voice_id,
          category: v.category || null,
          labels: labelParts.length ? labelParts.join(" · ") : null,
          gender,
          accent,
          age,
          preview_url: v.preview_url || null,
          source: "account" as const,
        };
      },
    );

    // Shared / library voices (broader catalog)
    const sharedParams = new URLSearchParams({
      page_size: "100",
      page: "0",
    });
    if (q) sharedParams.set("search", q);
    if (genderFilter === "male" || genderFilter === "female") {
      sharedParams.set("gender", genderFilter);
    }

    let sharedVoices: VoiceItem[] = [];
    try {
      const sharedRes = await fetch(
        `https://api.elevenlabs.io/v1/shared-voices?${sharedParams}`,
        { headers, next: { revalidate: 300 } },
      );
      if (sharedRes.ok) {
        const sharedData = await sharedRes.json();
        sharedVoices = (sharedData.voices || sharedData.shared_voices || []).map(
          (v: {
            voice_id?: string;
            public_owner_id?: string;
            name?: string;
            category?: string;
            gender?: string;
            accent?: string;
            age?: string;
            descriptive?: string;
            preview_url?: string;
            labels?: Record<string, string>;
          }) => {
            const id = String(v.voice_id || "");
            const gender = normalizeGender(
              v.gender || pickLabel(v.labels, "gender"),
            );
            const accent = v.accent || pickLabel(v.labels, "accent");
            const age = v.age || pickLabel(v.labels, "age");
            const labelParts = [
              gender,
              accent,
              age,
              v.category,
              v.descriptive,
            ].filter(Boolean);
            return {
              id,
              name: v.name || id,
              category: v.category || null,
              labels: labelParts.length ? labelParts.join(" · ") : null,
              gender,
              accent: accent || null,
              age: age || null,
              preview_url: v.preview_url || null,
              source: "shared" as const,
            };
          },
        );
      }
    } catch {
      /* shared library optional */
    }

    const byId = new Map<string, VoiceItem>();
    for (const v of [...accountVoices, ...sharedVoices]) {
      if (!v.id) continue;
      if (!byId.has(v.id)) byId.set(v.id, v);
    }

    let voices = Array.from(byId.values());

    if (genderFilter && genderFilter !== "all") {
      voices = voices.filter((v) => v.gender === genderFilter);
    }
    if (q) {
      voices = voices.filter((v) => {
        const hay = `${v.name} ${v.labels || ""} ${v.category || ""} ${v.accent || ""} ${v.age || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    voices.sort((a, b) => {
      if (a.source !== b.source) return a.source === "account" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      voices,
      total: voices.length,
      account: accountVoices.length,
      shared: sharedVoices.length,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to load voices",
        voices: [],
      },
      { status: 500 },
    );
  }
}
