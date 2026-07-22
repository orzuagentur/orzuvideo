import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  generateOtpCode,
  hashSecret,
  sendTransactionalEmail,
} from "@/lib/email/send";
import { buildLoginOtpEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

/** After password sign-in: issue email OTP and mark session as pending. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = generateOtpCode();
  const service = createServiceClient();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await service
    .from("auth_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("consumed_at", null);

  const { error: insertErr } = await service.from("auth_otp_codes").insert({
    user_id: user.id,
    email: user.email,
    code_hash: hashSecret(code),
    expires_at: expires,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const mail = buildLoginOtpEmail({ code });
  const sent = await sendTransactionalEmail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { error: sent.error || "Failed to send code" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    needsOtp: true,
    skippedEmail: Boolean(sent.skipped),
    ...(sent.skipped ? { devCode: code } : {}),
  });
  res.cookies.set("orzu_otp_ok", "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  res.cookies.set("orzu_otp_uid", user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  return res;
}
