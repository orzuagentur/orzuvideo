import { redirect } from "next/navigation";

/** Media moved to the separate admin project. */
export default function DashboardPage() {
  redirect("/dashboard/content");
}
