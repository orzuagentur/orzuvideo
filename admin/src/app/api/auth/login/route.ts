import { NextResponse } from "next/server";
import { createUserClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string } = {};
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const supabase = await createUserClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Verify is_admin with service role (authoritative)
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin,email")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    await supabase.auth.signOut();
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: "This account is not an admin" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: data.user.id,
    email: profile.email || data.user.email,
  });
}
