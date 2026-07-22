import { redirect } from "next/navigation";

/** Music library moved to the separate admin project. */
export default function MusicLibraryPage() {
  redirect("/dashboard/content");
}
