import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  recordLoginDevice,
  sendWelcomeIfNeeded,
} from "@/lib/email/devices";

export const runtime = "nodejs";

/**
 * After OAuth / session restore: remember device, welcome once,
 * alert only on later new device / IP mismatch.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    /* empty */
  }

  const action = String(body.action || "Sign-in").slice(0, 80);

  await recordLoginDevice({
    userId: user.id,
    email: user.email,
    request,
    action,
  });

  await sendWelcomeIfNeeded({
    userId: user.id,
    email: user.email,
    displayName:
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("orzu_otp_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set("orzu_otp_uid", user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
