import { createClient } from "@/lib/supabase/server";
import { InstagramTrainingStudio } from "@/components/instagram/InstagramTrainingStudio";

export default async function InstagramTrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("instagram_training")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <InstagramTrainingStudio
      initial={{
        niche: data?.niche || "lifestyle",
        content_type: data?.content_type || "reels_talking_head",
        style_prompt:
          data?.style_prompt ||
          "Friendly talking-head creator. Short punchy Reels. Look at camera. Clear CTA.",
        tone: data?.tone || "friendly",
        language: data?.language || "en",
        target_audience: data?.target_audience || "",
        hook_style: data?.hook_style || "bold opening",
        cta: data?.cta || "Follow for more",
        music_mood: data?.music_mood || "upbeat",
        voice_id: data?.voice_id || "21m00Tcm4TlvDq8ikWAM",
        duration_seconds: data?.duration_seconds || 30,
        brand_rules: data?.brand_rules || "",
      }}
    />
  );
}
