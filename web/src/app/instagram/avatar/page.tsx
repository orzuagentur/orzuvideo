import { createClient } from "@/lib/supabase/server";
import { InstagramAvatarStudio } from "@/components/instagram/InstagramAvatarStudio";

export default async function InstagramAvatarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("instagram_training")
    .select(
      "heygen_avatar_id, heygen_avatar_name, heygen_background_mode, heygen_background_url, avatar_image_url, visual_mode",
    )
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <InstagramAvatarStudio
      initial={{
        heygen_avatar_id: data?.heygen_avatar_id || "",
        heygen_avatar_name: data?.heygen_avatar_name || "",
        heygen_background_mode: data?.heygen_background_mode || "rotate",
        heygen_background_url: data?.heygen_background_url || "",
        avatar_image_url: data?.avatar_image_url || "",
        visual_mode: data?.visual_mode || "heygen",
      }}
    />
  );
}
