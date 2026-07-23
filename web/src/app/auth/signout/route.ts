import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/", appUrl()), { status: 303 });
  res.cookies.set("orzu_otp_ok", "", { path: "/", maxAge: 0 });
  res.cookies.set("orzu_otp_uid", "", { path: "/", maxAge: 0 });
  res.cookies.set("orzu_otp_purpose", "", { path: "/", maxAge: 0 });
  return res;
}
