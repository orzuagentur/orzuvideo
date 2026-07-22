"use client";

import { useCallback, useEffect, useState } from "react";
import type { UsageEvent } from "@/lib/types";

type Totals = {
  openai: { cost: number; units: number };
  elevenlabs: { cost: number; units: number };
  youtube: { cost: number; units: number };
  other: { cost: number; units: number };
  all: number;
};

export function CostsStudio() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/costs", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load costs");
      return;
    }
    setEvents((data.events as UsageEvent[]) || []);
    setTotals(data.totals as Totals);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Platform-wide usage this month (all users).
        </p>
      </header>

      {error && (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      )}

      {totals && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Scripts (AI)"
            cost={totals.openai.cost}
            units={`${Math.round(totals.openai.units)} tokens`}
          />
          <Card
            title="Voice"
            cost={totals.elevenlabs.cost}
            units={`${Math.round(totals.elevenlabs.units)} chars`}
          />
          <Card
            title="YouTube ops"
            cost={totals.youtube.cost}
            units={`${Math.round(totals.youtube.units)} actions`}
          />
          <Card title="Total" cost={totals.all} units="this month" highlight />
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="border-b border-[color:var(--line)] p-5">
          <h2 className="font-semibold">Usage log</h2>
        </div>
        <ul className="divide-y divide-[color:var(--line)]">
          {loading && (
            <li className="p-6 text-sm text-[color:var(--muted)]">Loading…</li>
          )}
          {!loading && events.length === 0 && (
            <li className="p-6 text-sm text-[color:var(--muted)]">
              No usage yet this month.
            </li>
          )}
          {events.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
            >
              <div>
                <p className="font-medium capitalize">{e.provider}</p>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {e.kind} · {Number(e.units).toLocaleString()} {e.unit_label} ·{" "}
                  {e.user_id ? `${e.user_id.slice(0, 8)}…` : "—"} ·{" "}
                  {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
              <p className="font-semibold">${Number(e.cost_usd).toFixed(4)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({
  title,
  cost,
  units,
  highlight,
}: {
  title: string;
  cost: number;
  units: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="panel p-4"
      style={{
        borderColor: highlight ? "rgba(232,165,75,0.45)" : undefined,
      }}
    >
      <p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold">${cost.toFixed(2)}</p>
      <p className="mt-1 text-xs text-[color:var(--muted)]">{units}</p>
    </div>
  );
}
