import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { InstagramAccountStudio } from "@/components/instagram/InstagramAccountStudio";

export default async function InstagramAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("instagram_accounts")
    .select(
      "connected, username, name, profile_picture_url, followers_count, media_count, facebook_page_name",
    )
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <Suspense fallback={<p className="text-sm text-[color:var(--muted)]">Loading…</p>}>
      <InstagramAccountStudio
        account={
          data
            ? {
                connected: data.connected,
                username: data.username,
                name: data.name,
                profile_picture_url: data.profile_picture_url,
                followers_count: data.followers_count ?? 0,
                media_count: data.media_count ?? 0,
                facebook_page_name: data.facebook_page_name,
              }
            : null
        }
      />
    </Suspense>
  );
}
