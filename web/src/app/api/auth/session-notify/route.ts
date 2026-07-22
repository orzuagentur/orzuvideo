import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  appUrl,
  clientIp,
  deviceKeyFromRequest,
  lookupLocation,
  parseDevice,
  sendTransactionalEmail,
} from "@/lib/email/send";
import {
  buildNewDeviceEmail,
  buildWelcomeEmail,
} from "@/lib/email/templates";

export const runtime = "nodejs";

/**
 * After Google OAuth (or any session without OTP gate): welcome + device alert.
 * Marks OTP as satisfied for OAuth providers.
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
  const service = createServiceClient();
  const ua = request.headers.get("user-agent");
  const { deviceName, deviceType } = parseDevice(ua);
  const key = deviceKeyFromRequest(request);
  const ip = clientIp(request);
  const location = await lookupLocation(ip);

  const { data: existing } = await service
    .from("auth_devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("device_key", key)
    .maybeSingle();

  if (existing) {
    await service
      .from("auth_devices")
      .update({
        last_seen_at: new Date().toISOString(),
        ip,
        location,
        device_name: deviceName,
        device_type: deviceType,
        user_agent: ua,
      })
      .eq("id", existing.id);
  } else {
    await service.from("auth_devices").insert({
      user_id: user.id,
      device_key: key,
      device_name: deviceName,
      device_type: deviceType,
      user_agent: ua,
      ip,
      location,
    });
    const mail = buildNewDeviceEmail({
      action,
      deviceName,
      deviceType,
      location: `${location}${ip !== "unknown" ? ` · IP ${ip}` : ""}`,
      appUrl: appUrl(),
    });
    void sendTransactionalEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
    });
  }

  const { data: profile } = await service
    .from("profiles")
    .select("welcome_email_sent_at,display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && !profile.welcome_email_sent_at) {
    const welcome = buildWelcomeEmail({
      name: profile.display_name || user.email.split("@")[0],
      appUrl: appUrl(),
    });
    const sent = await sendTransactionalEmail({
      to: user.email,
      subject: welcome.subject,
      html: welcome.html,
    });
    if (sent.ok) {
      await service
        .from("profiles")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", user.id);
    }
  }

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
