import { NextResponse } from "next/server";
import {
  createServiceClient,
  isAdminAuthenticated,
} from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const { data: profiles, error } = await sb
    .from("profiles")
    .select(
      "id,email,display_name,youtube_connected,youtube_channel_title,daily_videos_enabled,is_admin,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (profiles || []).map((p) => p.id);
  const jobCounts = new Map<string, number>();
  const costMap = new Map<string, number>();

  if (ids.length) {
    const { data: jobs } = await sb
      .from("video_jobs")
      .select("user_id")
      .in("user_id", ids);
    for (const j of jobs || []) {
      const uid = String(j.user_id);
      jobCounts.set(uid, (jobCounts.get(uid) || 0) + 1);
    }

    const { data: costs } = await sb
      .from("usage_events")
      .select("user_id,cost_usd")
      .in("user_id", ids)
      .gte("created_at", monthStart);
    for (const c of costs || []) {
      const uid = String(c.user_id);
      costMap.set(
        uid,
        (costMap.get(uid) || 0) + Number(c.cost_usd || 0),
      );
    }
  }

  const items: AdminUser[] = (profiles || []).map((p) => ({
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    youtube_connected: Boolean(p.youtube_connected),
    youtube_channel_title: p.youtube_channel_title,
    daily_videos_enabled: Boolean(p.daily_videos_enabled),
    is_admin: Boolean(p.is_admin),
    created_at: p.created_at,
    job_count: jobCounts.get(p.id) || 0,
    cost_usd_month: costMap.get(p.id) || 0,
  }));

  return NextResponse.json({ items, total: items.length });
}
