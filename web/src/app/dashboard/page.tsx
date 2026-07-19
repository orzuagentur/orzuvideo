import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { DashboardClient } from "@/components/DashboardClient";
import type { AiTraining, Profile, VideoJob } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: training }, { data: jobs }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("ai_training").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("video_jobs")
        .select(
          "id,status,title,script_text,youtube_url,error_message,scheduled_for,created_at,completed_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const hasYoutubeToken = Boolean(
    profile?.youtube_access_token || profile?.youtube_refresh_token,
  );

  const safeProfile: Profile | null = profile
    ? {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        youtube_connected: profile.youtube_connected,
        youtube_channel_id: profile.youtube_channel_id,
        youtube_channel_title: profile.youtube_channel_title,
        daily_videos_enabled: profile.daily_videos_enabled,
        videos_per_day: profile.videos_per_day,
      }
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-8">
      <AppNav email={user.email} />
      <DashboardClient
        profile={safeProfile}
        hasYoutubeToken={hasYoutubeToken}
        training={(training as AiTraining) ?? null}
        jobs={(jobs as VideoJob[]) ?? []}
      />
    </main>
  );
}
