import { createClient } from "@/lib/supabase/server";
import { ScheduleStudio } from "@/components/ScheduleStudio";
import type { PublishSchedule } from "@/lib/types";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("publish_schedules")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return <ScheduleStudio initial={(data as PublishSchedule) ?? null} />;
}
