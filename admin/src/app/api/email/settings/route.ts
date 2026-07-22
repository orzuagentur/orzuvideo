import { NextResponse } from "next/server";
import { createServiceClient, getAdminUser } from "@/lib/supabase/server";
import {
  composeFromHeader,
  parseDisplayName,
  parseEmailAddress,
} from "@/lib/email-from";

export const runtime = "nodejs";

const DEFAULT_FROM = "Support <support@orzuai.com>";

function normalizeSettings(row: {
  from_email?: string | null;
  from_name?: string | null;
  reply_to?: string | null;
  updated_at?: string | null;
} | null) {
  const envFrom = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const storedFrom = (row?.from_email || envFrom).trim() || envFrom;
  const address = parseEmailAddress(storedFrom);
  const fromName =
    (row?.from_name || "").trim() ||
    parseDisplayName(storedFrom) ||
    "Support";
  const fromEmail = composeFromHeader(fromName, address || storedFrom);

  return {
    fromEmail,
    fromAddress: address || parseEmailAddress(DEFAULT_FROM),
    fromName,
    replyTo: row?.reply_to || "",
    updatedAt: row?.updated_at || null,
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  };
}

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

  return NextResponse.json(normalizeSettings(data));
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

  const fromName = String(body.fromName || "").trim().slice(0, 80);
  const addressInput = String(
    body.fromAddress || body.fromEmail || "",
  ).trim().slice(0, 200);
  const replyTo = String(body.replyTo || "").trim().slice(0, 200);

  const address = parseEmailAddress(addressInput);
  if (!address || !address.includes("@")) {
    return NextResponse.json(
      { error: "Valid email address required (e.g. support@orzuai.com)" },
      { status: 400 },
    );
  }

  const name = fromName || "Support";
  const fromEmail = composeFromHeader(name, address);

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("email_settings")
    .upsert({
      id: 1,
      from_email: fromEmail,
      from_name: name,
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
    ...normalizeSettings(data),
  });
}
