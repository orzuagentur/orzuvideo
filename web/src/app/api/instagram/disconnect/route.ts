import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Instagram publishing was removed. Use /dashboard/avatar." },
    { status: 410 },
  );
}
