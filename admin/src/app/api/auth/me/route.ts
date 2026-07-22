import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    userId: admin.id,
    email: admin.email,
  });
}
