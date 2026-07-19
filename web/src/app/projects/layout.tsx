import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await supabase.from("creator_projects").upsert(
      [
        {
          user_id: user.id,
          platform: "youtube",
          name: "YouTube Shorts",
          is_enabled: true,
        },
        {
          user_id: user.id,
          platform: "instagram",
          name: "Instagram Reels",
          is_enabled: true,
        },
      ],
      { onConflict: "user_id,platform" },
    );
  } catch {
    /* migration may not be applied yet */
  }

  return <AppShell email={user.email}>{children}</AppShell>;
}
