import { redirect } from "next/navigation";

export default function InstagramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  redirect("/dashboard/avatar");
}
