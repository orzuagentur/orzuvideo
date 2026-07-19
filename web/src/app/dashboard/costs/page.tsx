import { createClient } from "@/lib/supabase/server";
import { CostsStudio } from "@/components/CostsStudio";
import type { UsageEvent } from "@/lib/types";

export default async function CostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const { data: events } = await supabase
    .from("usage_events")
    .select("*")
    .eq("user_id", user!.id)
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (events as UsageEvent[]) || [];
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

  return (
    <CostsStudio
      events={list}
      totals={{
        openai,
        elevenlabs,
        youtube,
        other,
        all: openai.cost + elevenlabs.cost + youtube.cost + other.cost,
      }}
    />
  );
}
