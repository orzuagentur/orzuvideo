import { redirect } from "next/navigation";

/** Channel picking lives in the sidebar drawer — no separate page. */
export default function ChannelsPickerPage() {
  redirect("/dashboard");
}
