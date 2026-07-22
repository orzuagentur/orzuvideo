import { NextResponse } from "next/server";
import { getOwnerUserId, isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ userId: getOwnerUserId() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Misconfigured" },
      { status: 500 },
    );
  }
}
