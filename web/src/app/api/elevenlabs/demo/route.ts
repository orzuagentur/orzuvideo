import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { demoTextForGroup } from "@/lib/music-groups";

/**
 * ElevenLabs TTS demo clip for music-group preview (~45s script).
 * POST { voiceId, groupId?, text? } → audio/mpeg
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add ELEVENLABS_API_KEY to preview demo voice." },
      { status: 503 },
    );
  }

  let body: { voiceId?: string; groupId?: string; text?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const voiceId = String(body.voiceId || "").trim();
  if (!voiceId) {
    return NextResponse.json(
      { error: "Choose a Voice in AI Training first" },
      { status: 400 },
    );
  }

  const text = (
    String(body.text || "").trim() ||
    demoTextForGroup(String(body.groupId || "epic"))
  ).slice(0, 1600);

  if (text.length < 12) {
    return NextResponse.json({ error: "Demo text too short" }, { status: 400 });
  }

  try {
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
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return NextResponse.json(
        { error: errText.slice(0, 240) || "ElevenLabs demo failed" },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await ttsRes.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Demo failed" },
      { status: 500 },
    );
  }
}
