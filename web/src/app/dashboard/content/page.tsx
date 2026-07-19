import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { ContentList } from "@/components/ContentList";
import type { VideoJob } from "@/lib/types";

export default async function ContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: jobs } = await supabase
    .from("video_jobs")
    .select(
      "id,status,title,script_text,youtube_url,error_message,scheduled_for,created_at,completed_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-8">
      <AppNav email={user.email} />
      <ContentList jobs={(jobs as VideoJob[]) ?? []} />
    </main>
  );
}
