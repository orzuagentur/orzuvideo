import { createServiceClient } from "@/lib/supabase/middleware";
import {
  generateOtpCode,
  hashSecret,
  sendTransactionalEmail,
} from "@/lib/email/send";
import { buildLoginOtpEmail } from "@/lib/email/templates";
import { NextResponse } from "next/server";

export type OtpPurpose = "login" | "signup";

export async function issueLoginOtp(opts: {
  userId: string;
  email: string;
  purpose?: OtpPurpose;
}): Promise<{
  ok: boolean;
  error?: string;
  skipped?: boolean;
  code?: string;
}> {
  const purpose = opts.purpose || "login";
  const code = generateOtpCode();
  const service = createServiceClient();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await service
    .from("auth_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", opts.userId)
    .is("consumed_at", null);

  const { error: insertErr } = await service.from("auth_otp_codes").insert({
    user_id: opts.userId,
    email: opts.email,
    code_hash: hashSecret(code),
    expires_at: expires,
  });

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  const mail = buildLoginOtpEmail({ code, purpose });
  const sent = await sendTransactionalEmail({
    to: opts.email,
    subject: mail.subject,
    html: mail.html,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error || "Failed to send code" };
  }

  return {
    ok: true,
    skipped: Boolean(sent.skipped),
    code: sent.skipped ? code : undefined,
  };
}

export function otpPendingCookies(
  userId: string,
  purpose: OtpPurpose = "signup",
): NextResponse {
  const res = NextResponse.json({
    ok: true,
    needsOtp: true,
  });
  applyOtpPendingCookies(res, userId, purpose);
  return res;
}

export function applyOtpPendingCookies(
  res: NextResponse,
  userId: string,
  purpose: OtpPurpose = "signup",
) {
  const secure = process.env.NODE_ENV === "production";
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 15,
  };
  res.cookies.set("orzu_otp_ok", "0", common);
  res.cookies.set("orzu_otp_uid", userId, common);
  res.cookies.set("orzu_otp_purpose", purpose, common);
}
