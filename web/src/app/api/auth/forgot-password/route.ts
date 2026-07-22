import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  appUrl,
  generateResetToken,
  hashSecret,
  sendTransactionalEmail,
} from "@/lib/email/send";
import { buildPasswordResetEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Always return ok to avoid account enumeration
  const okResponse = NextResponse.json({
    ok: true,
    message: "If that email exists, we sent a reset link.",
  });

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  if (!profile?.id) return okResponse;

  const token = generateResetToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await service
    .from("password_reset_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .is("consumed_at", null);

  const { error } = await service.from("password_reset_tokens").insert({
    user_id: profile.id,
    email: profile.email || email,
    token_hash: hashSecret(token),
    expires_at: expires,
  });
  if (error) {
    console.error("[forgot-password]", error);
    return okResponse;
  }

  const resetUrl = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const mail = buildPasswordResetEmail({ resetUrl });
  await sendTransactionalEmail({
    to: profile.email || email,
    subject: mail.subject,
    html: mail.html,
  });

  return okResponse;
}
