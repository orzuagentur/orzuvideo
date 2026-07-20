import { redirect } from "next/navigation";

/** Legacy Worker route → Favorites */
export default function WorkerRedirect() {
  redirect("/dashboard/favorites");
}
