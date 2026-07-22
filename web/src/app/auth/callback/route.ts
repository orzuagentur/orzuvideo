import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  }

  const user = data.user;
  const email = user.email;
  if (!email) {
    return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  }

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
      action: "Google sign-in",
      deviceName,
      deviceType,
      location: `${location}${ip !== "unknown" ? ` · IP ${ip}` : ""}`,
      appUrl: appUrl(),
    });
    void sendTransactionalEmail({
      to: email,
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
      name: profile.display_name || email.split("@")[0],
      appUrl: appUrl(),
    });
    const sent = await sendTransactionalEmail({
      to: email,
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

  const res = NextResponse.redirect(new URL(next, url.origin));
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
