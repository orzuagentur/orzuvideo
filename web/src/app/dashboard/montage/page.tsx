import { createClient } from "@/lib/supabase/server";
import { MontageStudio } from "@/components/MontageStudio";

export default async function MontagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("montage_settings")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <MontageStudio
      initial={{
        clip_count: data?.clip_count ?? 5,
        music_mood: data?.music_mood ?? "motivational epic",
        music_volume_hook: Number(data?.music_volume_hook ?? 0.88),
        music_volume_body: Number(data?.music_volume_body ?? 0.58),
        voice_volume: Number(data?.voice_volume ?? 1.05),
        transitions_enabled: data?.transitions_enabled ?? true,
        motions_enabled: data?.motions_enabled ?? true,
        punch_first_clip: data?.punch_first_clip ?? true,
        enabled_transitions: data?.enabled_transitions ?? [
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
        enabled_motions: data?.enabled_motions ?? [
          "punch_in",
          "slow_push",
          "rise",
          "drift_left",
          "drift_right",
          "snap_zoom",
        ],
        avoid_reuse_days: data?.avoid_reuse_days ?? 60,
      }}
    />
  );
}
