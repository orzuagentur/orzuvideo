import { createClient } from "@/lib/supabase/server";
import { InstagramContentStudio } from "@/components/instagram/InstagramContentStudio";

export default async function InstagramContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: jobs }, { data: training }] = await Promise.all([
    supabase
      .from("instagram_jobs")
      .select(
        "id,status,title,caption,preview_url,instagram_permalink,error_message,created_at,completed_at",
      )
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("instagram_training")
      .select(
        "heygen_avatar_id, heygen_avatar_name, voice_id, duration_seconds, language, tone, style_prompt, hook_style, cta",
      )
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  return (
    <InstagramContentStudio
      jobs={jobs || []}
      defaults={{
        heygen_avatar_id: training?.heygen_avatar_id || "",
        heygen_avatar_name: training?.heygen_avatar_name || "",
        voice_id: training?.voice_id || "21m00Tcm4TlvDq8ikWAM",
        duration_seconds: training?.duration_seconds || 30,
        language: training?.language || "en",
        tone: training?.tone || "friendly",
        style_prompt: training?.style_prompt || "",
        hook_style: training?.hook_style || "",
        cta: training?.cta || "",
      }}
    />
  );
}
