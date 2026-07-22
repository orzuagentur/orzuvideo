"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUser } from "@/lib/types";

export function UsersStudio() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load users");
      setItems([]);
      return;
    }
    setItems((data.items as AdminUser[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((u) => {
    const hay = `${u.email || ""} ${u.display_name || ""} ${u.youtube_channel_title || ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            All accounts from Supabase — {items.length} total.
          </p>
        </div>
        <input
          className="field max-w-xs"
          placeholder="Search email / name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </header>

      {error && (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      )}

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[color:var(--line)] text-xs uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">YouTube</th>
                <th className="px-4 py-3 font-medium">Jobs</th>
                <th className="px-4 py-3 font-medium">Cost / mo</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-[color:var(--muted)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-[color:var(--muted)]">
                    No users found.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {u.display_name || u.email || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {u.email}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[color:var(--muted)]">
                      {u.id}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {u.youtube_connected ? (
                      <span className="text-[color:var(--success)]">
                        {u.youtube_channel_title || "Connected"}
                      </span>
                    ) : (
                      <span className="text-[color:var(--muted)]">—</span>
                    )}
                    {u.daily_videos_enabled && (
                      <span className="mt-1 block text-[10px] text-[color:var(--accent)]">
                        Daily AI on
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{u.job_count}</td>
                  <td className="px-4 py-3 tabular-nums">
                    ${u.cost_usd_month.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--muted)]">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
