import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  clearRateLimit,
  getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Email/password login with per-IP + email rate limiting.
 * Successful logins clear the bucket for that key.
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

  if (!email.includes("@") || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  const key = `login:${ip}:${email}`;
  const limited = checkRateLimit(key, { maxHits: 8 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: limited.error, retryAfterSec: limited.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  clearRateLimit(key);
  return NextResponse.json({ ok: true });
}
