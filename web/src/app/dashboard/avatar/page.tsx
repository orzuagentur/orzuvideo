import { createClient } from "@/lib/supabase/server";
import { AvatarStudio } from "@/components/AvatarStudio";
import { AvatarContentStudio } from "@/components/AvatarContentStudio";

export default async function AvatarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: training }, { data: jobs }] = await Promise.all([
    supabase.from("instagram_training").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("instagram_jobs")
      .select(
        "id,status,title,caption,preview_url,error_message,created_at,completed_at",
      )
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-10">
      <AvatarStudio
        initial={{
          heygen_avatar_id: training?.heygen_avatar_id || "",
          heygen_avatar_name: training?.heygen_avatar_name || "",
          heygen_background_mode: training?.heygen_background_mode || "none",
          heygen_background_url: training?.heygen_background_url || "",
          avatar_image_url: training?.avatar_image_url || "",
          visual_mode: training?.visual_mode || "heygen",
        }}
      />
      <AvatarContentStudio
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
    </div>
  );
}
