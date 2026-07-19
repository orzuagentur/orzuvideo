import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarShell } from "@/components/SidebarShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <SidebarShell email={user.email}>{children}</SidebarShell>;
}
