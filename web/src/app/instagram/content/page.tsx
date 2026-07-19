import { createClient } from "@/lib/supabase/server";
import { InstagramContentStudio } from "@/components/instagram/InstagramContentStudio";

export default async function InstagramContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("instagram_jobs")
    .select(
      "id,status,title,caption,preview_url,instagram_permalink,error_message,created_at,completed_at",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return <InstagramContentStudio jobs={jobs || []} />;
}
