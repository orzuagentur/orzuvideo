import { createClient } from "@/lib/supabase/server";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import { HomeQuickActions } from "@/components/HomeQuickActions";

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const active = user ? await getActiveYoutubeChannel(user.id) : null;

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("youtube_connected")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const trainingQuery =
    user && active?.channel_id
      ? supabase
          .from("ai_training")
          .select("is_trained")
          .eq("user_id", user.id)
          .eq("youtube_channel_id", active.channel_id)
          .maybeSingle()
      : user
        ? supabase
            .from("ai_training")
            .select("is_trained")
            .eq("user_id", user.id)
            .maybeSingle()
        : null;

  const scheduleQuery =
    user && active?.channel_id
      ? supabase
          .from("publish_schedules")
          .select("enabled")
          .eq("user_id", user.id)
          .eq("youtube_channel_id", active.channel_id)
          .maybeSingle()
      : user
        ? supabase
            .from("publish_schedules")
            .select("enabled")
            .eq("user_id", user.id)
            .maybeSingle()
        : null;

  const [{ data: training }, { data: schedule }] = await Promise.all([
    trainingQuery ?? Promise.resolve({ data: null }),
    scheduleQuery ?? Promise.resolve({ data: null }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <HomeQuickActions
        youtubeConnected={Boolean(profile?.youtube_connected || active)}
        isTrained={Boolean(training?.is_trained)}
        aiEnabled={Boolean(schedule?.enabled)}
      />
    </div>
  );
}
