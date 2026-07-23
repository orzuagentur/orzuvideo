import { redirect } from "next/navigation";

/** Legacy URL — Home is the open active channel. */
export default function ChannelPage() {
  redirect("/dashboard");
}
