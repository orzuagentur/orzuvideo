import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { applyOtpPendingCookies, issueLoginOtp } from "@/lib/email/otp";
import { passwordValidationError } from "@/lib/password";
import {
  checkRateLimit,
  clearRateLimit,
  getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Create account without Supabase's built-in confirm email.
 * User is email_confirm'd via service role, signed in, then gets our OTP screen.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const pwErr = passwordValidationError(password);
  if (pwErr) {
    return NextResponse.json({ error: pwErr }, { status: 400 });
  }

  const ip = getClientIp(request);
  const key = `register:${ip}`;
  const limited = checkRateLimit(key, { maxHits: 6 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: limited.error, retryAfterSec: limited.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const service = createServiceClient();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    const msg = createErr?.message || "Could not create account";
    if (/already|registered|exists/i.test(msg)) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) {
    return NextResponse.json(
      {
        error:
          "Account created, but sign-in failed. Please log in and enter the verification code.",
      },
      { status: 500 },
    );
  }

  const issued = await issueLoginOtp({
    userId: created.user.id,
    email,
    purpose: "signup",
  });
  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error || "Could not send verification code" },
      { status: 500 },
    );
  }

  clearRateLimit(key);

  const res = NextResponse.json({
    ok: true,
    needsOtp: true,
    purpose: "signup",
    skippedEmail: Boolean(issued.skipped),
    ...(issued.code ? { devCode: issued.code } : {}),
  });
  applyOtpPendingCookies(res, created.user.id, "signup");
  return res;
}
