import { NextResponse } from "next/server";

/** Prefer /api/avatar — kept as alias. */
export { POST } from "@/app/api/avatar/route";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST /api/avatar or UI at /dashboard/avatar",
  });
}
