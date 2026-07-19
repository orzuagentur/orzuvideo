"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublishSchedule } from "@/lib/types";

const DAY_LABELS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
];

const defaults: PublishSchedule = {
  enabled: false,
  mode: "daily",
  videos_per_day: 2,
  times: ["09:00", "18:00"],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  custom_dates: [],
  timezone: "Europe/Berlin",
};

export function ScheduleStudio({ initial }: { initial: PublishSchedule | null }) {
  const router = useRouter();
  const [form, setForm] = useState<PublishSchedule>({ ...defaults, ...initial });
  const [timesText, setTimesText] = useState((form.times || []).join(", "));
  const [datesText, setDatesText] = useState((form.custom_dates || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const payload: PublishSchedule = {
      ...form,
      times: timesText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      custom_dates: datesText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setMsg("Schedule saved.");
    router.refresh();
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const set = new Set(prev.weekdays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...prev, weekdays: Array.from(set).sort() };
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Choose days, dates and exact publish times for automatic Shorts.
        </p>
      </header>

      <section className="panel rise space-y-5 p-6">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Enable scheduled publishing
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--muted)]">Mode</span>
          <select
            className="field"
            value={form.mode}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                mode: e.target.value as PublishSchedule["mode"],
              }))
            }
          >
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays only</option>
            <option value="custom_days">Selected weekdays</option>
            <option value="dates">Specific dates</option>
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--muted)]">Videos per day</span>
          <input
            className="field"
            type="number"
            min={1}
            max={10}
            value={form.videos_per_day}
            onChange={(e) =>
              setForm((p) => ({ ...p, videos_per_day: Number(e.target.value) }))
            }
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--muted)]">
            Times (24h, comma-separated)
          </span>
          <input
            className="field"
            value={timesText}
            onChange={(e) => setTimesText(e.target.value)}
            placeholder="09:00, 14:00, 20:30"
          />
        </label>

        {(form.mode === "custom_days" || form.mode === "weekdays") && (
          <div className="space-y-2">
            <span className="text-sm text-[color:var(--muted)]">Days</span>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((d) => {
                const on = form.weekdays.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className="rounded-full px-3 py-1.5 text-sm"
                    style={{
                      background: on ? "rgba(232,165,75,0.16)" : "transparent",
                      border: `1px solid ${on ? "rgba(232,165,75,0.5)" : "var(--line)"}`,
                      color: on ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {form.mode === "dates" && (
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--muted)]">
              Dates (YYYY-MM-DD, comma-separated)
            </span>
            <input
              className="field"
              value={datesText}
              onChange={(e) => setDatesText(e.target.value)}
              placeholder="2026-07-20, 2026-07-25"
            />
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--muted)]">Timezone</span>
          <input
            className="field"
            value={form.timezone}
            onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
          />
        </label>
      </section>

      {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}
      {msg && <p className="text-sm text-[color:var(--success)]">{msg}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save schedule"}
      </button>
    </form>
  );
}
