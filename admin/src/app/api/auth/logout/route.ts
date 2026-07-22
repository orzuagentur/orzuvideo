import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createUserClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
