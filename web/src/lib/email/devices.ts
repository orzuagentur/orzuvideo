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

export type LoginDeviceResult = {
  isFirstDevice: boolean;
  isNewDevice: boolean;
  ipChanged: boolean;
  alertSent: boolean;
  deviceName: string;
  deviceType: string;
  ip: string;
  location: string;
};

/**
 * Persist device + IP for the account.
 * - First ever device: save silently (no “new login” mail).
 * - Later new device, or known device with different IP: send alert with real data.
 */
export async function recordLoginDevice(opts: {
  userId: string;
  email: string;
  request: Request;
  action: string;
}): Promise<LoginDeviceResult> {
  const service = createServiceClient();
  const ua = opts.request.headers.get("user-agent");
  const { deviceName, deviceType } = parseDevice(ua);
  const key = deviceKeyFromRequest(opts.request);
  const ip = clientIp(opts.request);
  const location = await lookupLocation(ip);
  const now = new Date().toISOString();

  const { count } = await service
    .from("auth_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", opts.userId);

  const priorCount = count ?? 0;

  const { data: existing } = await service
    .from("auth_devices")
    .select("id,ip,device_name,device_type")
    .eq("user_id", opts.userId)
    .eq("device_key", key)
    .maybeSingle();

  const isFirstDevice = priorCount === 0;
  const isNewDevice = !existing;
  const ipChanged = Boolean(
    existing?.ip &&
      ip &&
      ip !== "unknown" &&
      existing.ip !== "unknown" &&
      existing.ip !== ip,
  );

  if (existing) {
    await service
      .from("auth_devices")
      .update({
        last_seen_at: now,
        ip,
        location,
        device_name: deviceName,
        device_type: deviceType,
        user_agent: ua,
      })
      .eq("id", existing.id);
  } else {
    await service.from("auth_devices").insert({
      user_id: opts.userId,
      device_key: key,
      device_name: deviceName,
      device_type: deviceType,
      user_agent: ua,
      ip,
      location,
      last_seen_at: now,
    });
  }

  // Alert only after the account already has a remembered device
  const shouldAlert = !isFirstDevice && (isNewDevice || ipChanged);
  let alertSent = false;

  if (shouldAlert) {
    const when = new Date().toLocaleString("en-GB", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const mail = buildNewDeviceEmail({
      action: opts.action,
      deviceName,
      deviceType,
      ip: ip === "unknown" ? "Not available" : ip,
      location: location || "Unknown location",
      when: `${when} UTC`,
      appUrl: appUrl(),
    });
    const sent = await sendTransactionalEmail({
      to: opts.email,
      subject: mail.subject,
      html: mail.html,
    });
    alertSent = sent.ok && !sent.skipped;
  }

  return {
    isFirstDevice,
    isNewDevice,
    ipChanged,
    alertSent,
    deviceName,
    deviceType,
    ip,
    location,
  };
}

/** Send welcome once; safe to call after recordLoginDevice. */
export async function sendWelcomeIfNeeded(opts: {
  userId: string;
  email: string;
  displayName?: string | null;
}): Promise<boolean> {
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("welcome_email_sent_at,display_name")
    .eq("id", opts.userId)
    .maybeSingle();

  if (!profile || profile.welcome_email_sent_at) return false;

  const welcome = buildWelcomeEmail({
    name:
      opts.displayName ||
      profile.display_name ||
      opts.email.split("@")[0] ||
      "there",
    appUrl: appUrl(),
  });
  const sent = await sendTransactionalEmail({
    to: opts.email,
    subject: welcome.subject,
    html: welcome.html,
  });
  if (!sent.ok) return false;

  await service
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", opts.userId);
  return true;
}
