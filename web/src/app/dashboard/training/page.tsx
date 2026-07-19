import { createClient } from "@/lib/supabase/server";
import { TrainingStudio } from "@/components/TrainingStudio";
import type { AiTraining } from "@/lib/types";

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: training } = await supabase
    .from("ai_training")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return <TrainingStudio initial={(training as AiTraining) ?? null} />;
}
