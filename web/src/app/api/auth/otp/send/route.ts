import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyOtpPendingCookies, issueLoginOtp } from "@/lib/email/otp";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** After password sign-in: issue email OTP and mark session as pending. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = checkRateLimit(`otp:${getClientIp(request)}:${user.id}`, {
    maxHits: 5,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: limited.error, retryAfterSec: limited.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  let purpose: "login" | "signup" = "login";
  try {
    const body = (await request.json()) as { purpose?: string };
    if (body.purpose === "signup") purpose = "signup";
  } catch {
    /* empty body = login */
  }

  const issued = await issueLoginOtp({
    userId: user.id,
    email: user.email,
    purpose,
  });

  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error || "Failed to send code" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    needsOtp: true,
    purpose,
    skippedEmail: Boolean(issued.skipped),
    ...(issued.code ? { devCode: issued.code } : {}),
  });
  applyOtpPendingCookies(res, user.id, purpose);
  return res;
}
