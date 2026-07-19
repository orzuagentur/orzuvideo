import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function InstagramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure project row exists (best-effort until migration 005 is applied)
  try {
    await supabase.from("creator_projects").upsert(
      {
        user_id: user.id,
        platform: "instagram",
        name: "Instagram Reels",
        is_enabled: true,
      },
      { onConflict: "user_id,platform" },
    );
  } catch {
    /* migration may not be applied yet */
  }

  return <AppShell email={user.email}>{children}</AppShell>;
}
