import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SAMPLE =
  "This is how I will sound on your YouTube Shorts. Short, clear, and ready.";

/**
 * Returns an audio preview for an ElevenLabs voice.
 * Prefers the voice's built-in preview_url; falls back to a short TTS clip.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voiceId = request.nextUrl.searchParams.get("voiceId")?.trim();
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId required" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Add ELEVENLABS_API_KEY to web/.env.local to preview voices.",
      },
      { status: 503 },
    );
  }

  try {
    const metaRes = await fetch(
      `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const previewUrl = meta.preview_url as string | undefined;
      if (previewUrl) {
        return NextResponse.json({
          previewUrl,
          name: meta.name || null,
          source: "catalog",
        });
      }
    }

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: SAMPLE,
          model_id: "eleven_multilingual_v2",
        }),
      },
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return NextResponse.json(
        { error: errText.slice(0, 200) || "Preview failed" },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await ttsRes.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Preview failed" },
      { status: 500 },
    );
  }
}
