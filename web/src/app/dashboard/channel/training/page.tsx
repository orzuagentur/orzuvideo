import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TrainingStudio } from "@/components/TrainingStudio";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";
import type { AiTraining, PublishSchedule } from "@/lib/types";

export default async function ChannelTrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const active = await getActiveYoutubeChannel(user!.id);
  const channelId = active?.channel_id;

  const trainingQ = channelId
    ? supabase
        .from("ai_training")
        .select("*")
        .eq("user_id", user!.id)
        .eq("youtube_channel_id", channelId)
        .maybeSingle()
    : supabase
        .from("ai_training")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

  const scheduleQ = channelId
    ? supabase
        .from("publish_schedules")
        .select("*")
        .eq("user_id", user!.id)
        .eq("youtube_channel_id", channelId)
        .maybeSingle()
    : supabase
        .from("publish_schedules")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

  const [{ data: training }, { data: schedule }] = await Promise.all([
    trainingQ,
    scheduleQ,
  ]);

  return (
    <Suspense fallback={<p className="text-sm text-[color:var(--muted)]">Loading…</p>}>
      <TrainingStudio
        initial={(training as AiTraining) ?? null}
        schedule={(schedule as PublishSchedule) ?? null}
        embeddedInChannel
        channelTitle={active?.title || null}
      />
    </Suspense>
  );
}
