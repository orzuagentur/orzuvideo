import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Instagram publish removed. Use Avatar download instead." },
    { status: 410 },
  );
}
