import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  recordLoginDevice,
  sendWelcomeIfNeeded,
} from "@/lib/email/devices";

export const runtime = "nodejs";

/**
 * After OAuth / password login: remember device, welcome once,
 * alert only on later new device / IP mismatch.
 * Does not clear signup OTP pending state.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const otpOk = jar.get("orzu_otp_ok")?.value;
  const otpUid = jar.get("orzu_otp_uid")?.value;
  const otpPurpose = jar.get("orzu_otp_purpose")?.value;
  if (otpOk === "0" && otpUid === user.id && otpPurpose === "signup") {
    return NextResponse.json(
      { error: "Email verification required", needsOtp: true },
      { status: 403 },
    );
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

  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  res.cookies.set("orzu_otp_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set("orzu_otp_uid", user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set("orzu_otp_purpose", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
