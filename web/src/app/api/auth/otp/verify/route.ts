import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import {
  appUrl,
  clientIp,
  deviceKeyFromRequest,
  hashSecret,
  lookupLocation,
  parseDevice,
  sendTransactionalEmail,
} from "@/lib/email/send";
import { buildNewDeviceEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = String(body.code || "").replace(/\D/g, "");
  if (code.length !== 6) {
    return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("auth_otp_codes")
    .select("id,code_hash,expires_at,consumed_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = rows?.[0];
  if (!row) {
    return NextResponse.json({ error: "No code found — request a new one" }, { status: 400 });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Code expired — request a new one" }, { status: 400 });
  }
  if (row.code_hash !== hashSecret(code)) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 400 });
  }

  await service
    .from("auth_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  // Device tracking + new-device email
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
      action: "Email & password login (verified)",
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

  // Welcome once
  const { data: profile } = await service
    .from("profiles")
    .select("welcome_email_sent_at,display_name,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && !profile.welcome_email_sent_at) {
    const { buildWelcomeEmail } = await import("@/lib/email/templates");
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
