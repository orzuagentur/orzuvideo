import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { ChannelPicker } from "@/components/ChannelPicker";

export default async function ChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("youtube_access_token, youtube_refresh_token")
    .eq("id", user.id)
    .maybeSingle();

  const hasToken =
    Boolean(profile?.youtube_access_token) ||
    Boolean(profile?.youtube_refresh_token);

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-6 py-8">
      <AppNav email={user.email} />

      {!hasToken ? (
        <div className="panel rise space-y-4 p-6">
          <h1 className="text-xl font-semibold">Connect YouTube first</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Authorize Google, then choose which channel to publish to.
          </p>
          <a href="/api/youtube/connect" className="btn btn-primary">
            Connect YouTube
          </a>
        </div>
      ) : (
        <ChannelPicker />
      )}
    </main>
  );
}
