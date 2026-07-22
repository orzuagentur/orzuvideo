import { redirect } from "next/navigation";

/** Expenses moved to the separate admin project. */
export default function CostsPage() {
  redirect("/dashboard/content");
}
