import { NextResponse } from "next/server";
import { createServiceClient, getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("email_settings")
    .select("from_email,from_name,reply_to,updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    fromEmail:
      data?.from_email ||
      process.env.RESEND_FROM_EMAIL ||
      "Support <support@orzuai.com>",
    fromName: data?.from_name || "OrzuAi",
    replyTo: data?.reply_to || "",
    updatedAt: data?.updated_at || null,
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  });
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromEmail = String(body.fromEmail || "").trim().slice(0, 200);
  const fromName = String(body.fromName || "").trim().slice(0, 80);
  const replyTo = String(body.replyTo || "").trim().slice(0, 200);

  if (!fromEmail) {
    return NextResponse.json({ error: "From address required" }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("email_settings")
    .upsert({
      id: 1,
      from_email: fromEmail,
      from_name: fromName || "OrzuAi",
      reply_to: replyTo || null,
      updated_at: new Date().toISOString(),
    })
    .select("from_email,from_name,reply_to,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fromEmail: data.from_email,
    fromName: data.from_name,
    replyTo: data.reply_to || "",
    updatedAt: data.updated_at,
  });
}
