import { createHash, randomBytes, randomInt } from "crypto";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/middleware";

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://www.orzuai.com"
  );
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export async function getEmailFromAddress(): Promise<string> {
  const fallback =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Support <support@orzuai.com>";
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("email_settings")
      .select("from_email")
      .eq("id", 1)
      .maybeSingle();
    return (data?.from_email || fallback).trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn("[email] RESEND_API_KEY missing — skip send:", opts.subject);
    return { ok: true, skipped: true };
  }
  const from = await getEmailFromAddress();
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    console.error("[email] Resend error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function parseDevice(uaRaw: string | null): {
  deviceName: string;
  deviceType: string;
} {
  const ua = (uaRaw || "").toLowerCase();
  let browser = "Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("mac os")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";

  let deviceType = "Desktop";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
    deviceType = "Mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    deviceType = "Tablet";
  }

  return { deviceName: `${browser} on ${os}`, deviceType };
}

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export async function lookupLocation(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip === "::1") {
    return "Local / unknown";
  }
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return "Unknown location";
    const data = (await res.json()) as {
      city?: string;
      country_name?: string;
      error?: boolean;
    };
    if (data.error) return "Unknown location";
    const parts = [data.city, data.country_name].filter(Boolean);
    return parts.length ? `${parts.join(", ")} (approx.)` : "Unknown location";
  } catch {
    return "Unknown location";
  }
}

export function deviceKeyFromRequest(request: Request): string {
  const ua = request.headers.get("user-agent") || "unknown";
  return hashSecret(`${ua}|${request.headers.get("sec-ch-ua-platform") || ""}`);
}
