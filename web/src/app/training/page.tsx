import { redirect } from "next/navigation";

export default function LegacyTrainingRedirect() {
  redirect("/dashboard/training");
}
