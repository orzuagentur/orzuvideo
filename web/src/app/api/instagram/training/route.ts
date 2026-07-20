import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Instagram training UI removed. Use /dashboard/avatar." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Instagram training UI removed. Use /dashboard/avatar." },
    { status: 410 },
  );
}
