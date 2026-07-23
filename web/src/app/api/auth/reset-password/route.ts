import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  appUrl,
  hashSecret,
  sendTransactionalEmail,
} from "@/lib/email/send";
import { buildPasswordResetSuccessEmail } from "@/lib/email/templates";
import { passwordValidationError } from "@/lib/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try {
    body = (await request.json()) as { token?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const pwErr = passwordValidationError(password);
  if (pwErr) {
    return NextResponse.json({ error: pwErr }, { status: 400 });
  }

  const limited = checkRateLimit(`reset:${getClientIp(request)}`, {
    maxHits: 10,
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

  const service = createServiceClient();
  const tokenHash = hashSecret(token);
  const { data: row, error } = await service
    .from("password_reset_tokens")
    .select("id,user_id,email,expires_at,consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row || row.consumed_at) {
    return NextResponse.json({ error: "Invalid or used reset link" }, { status: 400 });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Reset link expired" }, { status: 400 });
  }

  const { error: updErr } = await service.auth.admin.updateUserById(row.user_id, {
    password,
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await service
    .from("password_reset_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  const mail = buildPasswordResetSuccessEmail({ appUrl: appUrl() });
  await sendTransactionalEmail({
    to: row.email,
    subject: mail.subject,
    html: mail.html,
  });

  return NextResponse.json({ ok: true });
}
