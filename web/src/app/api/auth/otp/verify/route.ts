import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/middleware";
import { hashSecret } from "@/lib/email/send";
import {
  recordLoginDevice,
  sendWelcomeIfNeeded,
} from "@/lib/email/devices";

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
    return NextResponse.json(
      { error: "No code found — request a new one" },
      { status: 400 },
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Code expired — request a new one" },
      { status: 400 },
    );
  }
  if (row.code_hash !== hashSecret(code)) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 400 });
  }

  await service
    .from("auth_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  await recordLoginDevice({
    userId: user.id,
    email: user.email,
    request,
    action: "Email & password login (verified)",
  });

  await sendWelcomeIfNeeded({
    userId: user.id,
    email: user.email,
  });

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
