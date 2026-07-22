import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdminAuthenticated())) redirect("/login");
  return <AdminShell>{children}</AdminShell>;
}
