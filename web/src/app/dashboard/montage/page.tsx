import { redirect } from "next/navigation";

/** Legacy Montage route → AI Clipping */
export default function MontageRedirect() {
  redirect("/dashboard/clipping");
}
