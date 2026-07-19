"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AiTraining, DashboardStats, Profile, VideoJob } from "@/lib/types";
import { JOB_STATUS_LABEL, statusColor } from "@/lib/job-status";

export function DashboardHome({
  profile,
  training,
  stats,
  recent,
  ready,
}: {
  profile: Profile | null;
  training: AiTraining | null;
  stats: DashboardStats;
  recent: VideoJob[];
  ready: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generateNow() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/jobs", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Failed");
      return;
    }
    setMsg("Short queued.");
    router.refresh();
  }

  const cards = [
    { label: "Published", value: stats.published, tone: "var(--success)" },
    { label: "In queue", value: stats.queued, tone: "var(--accent)" },
    { label: "Processing", value: stats.processing, tone: "#7eb6ff" },
    { label: "Failed", value: stats.failed, tone: "var(--danger)" },
    {
      label: "Spend (month)",
      value: `$${stats.costUsdMonth.toFixed(2)}`,
      tone: "var(--fg)",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Overview of publishing, queue and spend.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready || busy}
          onClick={generateNow}
        >
          {busy ? "Queuing…" : "Generate Short now"}
        </button>
      </header>

      {msg && <p className="text-sm text-[color:var(--accent)]">{msg}</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="panel rise p-4">
            <p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
              {c.label}
            </p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: c.tone }}>
              {c.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel rise p-5 lg:col-span-1">
          <h2 className="font-semibold">Setup</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-[color:var(--muted)]">YouTube</span>
              <span>
                {profile?.youtube_connected
                  ? profile.youtube_channel_title || "Connected"
                  : "Not connected"}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-[color:var(--muted)]">AI training</span>
              <span>{training?.is_trained ? "Ready" : "Needed"}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-[color:var(--muted)]">Autopilot</span>
              <span>{profile?.daily_videos_enabled ? "On" : "Off"}</span>
            </li>
          </ul>
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/dashboard/channel" className="btn btn-ghost text-sm">
              Open channel
            </Link>
            <Link href="/dashboard/training" className="btn btn-primary text-sm">
              Train AI
            </Link>
          </div>
        </div>

        <div className="panel rise p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recent content</h2>
            <Link href="/dashboard/content" className="text-sm text-[color:var(--accent)]">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-[color:var(--line)]">
            {recent.length === 0 && (
              <li className="py-6 text-sm text-[color:var(--muted)]">No content yet.</li>
            )}
            {recent.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.title || "Untitled"}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    <span style={{ color: statusColor(job.status) }}>
                      {JOB_STATUS_LABEL[job.status] || job.status}
                    </span>
                    {" · "}
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                {job.youtube_url && (
                  <a
                    href={job.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost text-xs"
                  >
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
