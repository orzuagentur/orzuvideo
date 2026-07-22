import { NextResponse } from "next/server";
import {
  createServiceClient,
  isAdminAuthenticated,
} from "@/lib/supabase/server";
import type { UsageEvent } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get("user_id") || "").trim();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const sb = createServiceClient();
  let query = sb
    .from("usage_events")
    .select(
      "id,user_id,provider,kind,units,unit_label,cost_usd,meta,created_at,job_id",
    )
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(500);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (data as UsageEvent[]) || [];
  const bucket = (provider: string) => {
    const rows = list.filter((e) => e.provider === provider);
    return {
      cost: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
      units: rows.reduce((s, r) => s + Number(r.units || 0), 0),
    };
  };

  const openai = bucket("openai");
  const elevenlabs = bucket("elevenlabs");
  const youtube = bucket("youtube");
  const otherRows = list.filter(
    (e) => !["openai", "elevenlabs", "youtube"].includes(e.provider),
  );
  const other = {
    cost: otherRows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    units: otherRows.reduce((s, r) => s + Number(r.units || 0), 0),
  };

  const byUser = new Map<string, number>();
  for (const e of list) {
    const uid = String(e.user_id || "unknown");
    byUser.set(uid, (byUser.get(uid) || 0) + Number(e.cost_usd || 0));
  }

  return NextResponse.json({
    events: list,
    totals: {
      openai,
      elevenlabs,
      youtube,
      other,
      all: openai.cost + elevenlabs.cost + youtube.cost + other.cost,
    },
    byUser: Object.fromEntries(byUser),
  });
}
