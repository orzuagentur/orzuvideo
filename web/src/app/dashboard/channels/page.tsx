import { createClient } from "@/lib/supabase/server";
import { ChannelPicker } from "@/components/ChannelPicker";

export default async function ChannelsPickerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("youtube_access_token, youtube_refresh_token")
    .eq("id", user!.id)
    .maybeSingle();

  const hasToken =
    Boolean(profile?.youtube_access_token) ||
    Boolean(profile?.youtube_refresh_token);

  if (!hasToken) {
    return (
      <div className="panel rise space-y-4 p-6">
        <h1 className="text-xl font-semibold">Connect YouTube first</h1>
        <a href="/api/youtube/connect" className="btn btn-primary">
          Connect YouTube
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <ChannelPicker />
    </div>
  );
}
