import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULTS = {
  clip_count: 5,
  music_mood: "motivational epic",
  music_volume_hook: 0.88,
  music_volume_body: 0.58,
  voice_volume: 1.05,
  transitions_enabled: true,
  motions_enabled: true,
  punch_first_clip: true,
  enabled_transitions: [
    "fade",
    "wipeleft",
    "wiperight",
    "slideleft",
    "slideright",
    "circleopen",
    "dissolve",
    "radial",
    "smoothleft",
    "diagtl",
  ],
  enabled_motions: [
    "punch_in",
    "slow_push",
    "rise",
    "drift_left",
    "drift_right",
    "snap_zoom",
  ],
  avoid_reuse_days: 60,
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("montage_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ settings: data || { user_id: user.id, ...DEFAULTS } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const payload = {
    user_id: user.id,
    clip_count: Math.min(8, Math.max(3, Number(body.clip_count) || 5)),
    music_mood: String(body.music_mood || "motivational epic"),
    music_volume_hook: Math.min(
      1.2,
      Math.max(0.3, Number(body.music_volume_hook) || 0.88),
    ),
    music_volume_body: Math.min(
      1.0,
      Math.max(0.2, Number(body.music_volume_body) || 0.58),
    ),
    voice_volume: Math.min(1.4, Math.max(0.7, Number(body.voice_volume) || 1.05)),
    transitions_enabled: body.transitions_enabled !== false,
    motions_enabled: body.motions_enabled !== false,
    punch_first_clip: body.punch_first_clip !== false,
    enabled_transitions: Array.isArray(body.enabled_transitions)
      ? body.enabled_transitions.map(String)
      : DEFAULTS.enabled_transitions,
    enabled_motions: Array.isArray(body.enabled_motions)
      ? body.enabled_motions.map(String)
      : DEFAULTS.enabled_motions,
    avoid_reuse_days: Math.min(365, Math.max(7, Number(body.avoid_reuse_days) || 60)),
  };

  const { error } = await supabase
    .from("montage_settings")
    .upsert(payload, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: payload });
}
