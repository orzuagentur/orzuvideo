import { createClient } from "@/lib/supabase/server";
import { InstagramDashboard } from "@/components/instagram/InstagramDashboard";

export default async function InstagramHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: account }, { data: training }, { data: jobs }] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("connected, username, followers_count, media_count")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("instagram_training")
      .select("is_trained, heygen_avatar_id, niche")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("instagram_jobs")
      .select("id, status")
      .eq("user_id", user!.id)
      .limit(100),
  ]);

  const list = jobs || [];
  const stats = {
    ready: list.filter((j) => j.status === "ready").length,
    queued: list.filter((j) => j.status === "queued").length,
    published: list.filter((j) => j.status === "published").length,
    failed: list.filter((j) => j.status === "failed").length,
  };

  return (
    <InstagramDashboard
      account={
        account
          ? {
              connected: account.connected,
              username: account.username,
              followers: account.followers_count ?? 0,
              media: account.media_count ?? 0,
            }
          : null
      }
      training={{
        ready: Boolean(training?.is_trained),
        hasAvatar: Boolean(training?.heygen_avatar_id),
        niche: training?.niche || null,
      }}
      stats={stats}
    />
  );
}
