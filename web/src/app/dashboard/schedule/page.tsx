import { redirect } from "next/navigation";

export default function ScheduleRedirect() {
  redirect("/dashboard/channel/training#schedule");
}
