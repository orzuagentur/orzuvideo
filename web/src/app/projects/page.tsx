import { createClient } from "@/lib/supabase/server";
import { ProjectsStudio } from "@/components/ProjectsStudio";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: ig }, { data: projects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("youtube_connected, youtube_channel_title")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("instagram_accounts")
      .select("connected, username")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("creator_projects")
      .select("platform, name, is_enabled")
      .eq("user_id", user!.id),
  ]);

  return (
    <ProjectsStudio
      youtube={{
        connected: Boolean(profile?.youtube_connected),
        title: profile?.youtube_channel_title || null,
      }}
      instagram={{
        connected: Boolean(ig?.connected),
        username: ig?.username || null,
      }}
      projects={(projects || []).map((p) => ({
        platform: p.platform as "youtube" | "instagram",
        name: p.name,
        enabled: p.is_enabled,
      }))}
    />
  );
}
