import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type VoiceItem = {
  id: string;
  name: string;
  category: string | null;
  labels: string | null;
  preview_url: string | null;
};

/** List ElevenLabs voices available on this API key. */
export async function GET() {
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

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      next: { revalidate: 300 },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail?.message || data.message || "Failed to load voices", voices: [] },
        { status: 502 },
      );
    }

    const voices: VoiceItem[] = (data.voices || []).map(
      (v: {
        voice_id: string;
        name?: string;
        category?: string;
        labels?: Record<string, string>;
        preview_url?: string;
      }) => {
        const labelParts = v.labels
          ? Object.entries(v.labels)
              .slice(0, 3)
              .map(([, val]) => val)
              .filter(Boolean)
          : [];
        return {
          id: v.voice_id,
          name: v.name || v.voice_id,
          category: v.category || null,
          labels: labelParts.length ? labelParts.join(" · ") : null,
          preview_url: v.preview_url || null,
        };
      },
    );

    voices.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ voices });
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
