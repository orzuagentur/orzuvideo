import { NextResponse } from "next/server";
import {
  checkAdminPassword,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = String(body.password || "");
  if (!(await checkAdminPassword(password))) {
    // Soft delay against brute force
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieOptions(token));
  return res;
}
