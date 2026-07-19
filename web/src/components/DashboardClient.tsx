"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AiTraining, Profile, VideoJob } from "@/lib/types";
import { JOB_STATUS_LABEL, statusColor } from "@/lib/job-status";

export function DashboardClient({
  profile,
  hasYoutubeToken,
  training,
  jobs,
}: {
  profile: Profile | null;
  hasYoutubeToken: boolean;
  training: AiTraining | null;
  jobs: VideoJob[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(profile?.daily_videos_enabled ?? false);

  async function toggleDaily(next: boolean) {
    setBusy("daily");
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_videos_enabled: next }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMessage(data.error || "Failed to update settings");
      return;
    }
    setEnabled(next);
    setMessage(next ? "Daily autopilot ON — 2 Shorts/day." : "Autopilot paused.");
    router.refresh();
  }

  async function generateNow() {
    setBusy("generate");
    setMessage(null);
    const res = await fetch("/api/jobs", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMessage(data.error || "Could not queue job");
      return;
    }
    setMessage("Job queued. Open Content to track it.");
    router.refresh();
  }

  const ready =
    Boolean(profile?.youtube_connected) && Boolean(training?.is_trained);

  return (
    <div className="space-y-6">
      <section className="panel rise grid gap-6 p-6 sm:grid-cols-3">
        <StatusBlock
          title="1. YouTube"
          ok={Boolean(profile?.youtube_connected)}
          detail={
            profile?.youtube_connected
              ? profile.youtube_channel_title || "Connected"
              : hasYoutubeToken
                ? "Pick a channel"
                : "Not connected"
          }
          action={
            <div className="flex flex-wrap gap-2">
              {hasYoutubeToken ? (
                <Link
                  href="/dashboard/channels"
                  className="btn btn-primary text-sm"
                >
                  {profile?.youtube_connected
                    ? "Change channel"
                    : "Choose channel"}
                </Link>
              ) : null}
              <a href="/api/youtube/connect" className="btn btn-ghost text-sm">
                {hasYoutubeToken ? "Reconnect" : "Connect YouTube"}
              </a>
            </div>
          }
        />
        <StatusBlock
          title="2. AI training"
          ok={Boolean(training?.is_trained)}
          detail={
            training?.is_trained
              ? `${training.niche} · ${training.content_type}`
              : "Train once"
          }
          action={
            <Link href="/training" className="btn btn-primary text-sm">
              {training?.is_trained ? "Edit training" : "Train AI"}
            </Link>
          }
        />
        <StatusBlock
          title="3. Daily autopilot"
          ok={enabled}
          detail={enabled ? `${profile?.videos_per_day ?? 2} Shorts / day` : "Off"}
          action={
            <button
              className="btn btn-primary text-sm"
              disabled={!ready || busy === "daily"}
              onClick={() => toggleDaily(!enabled)}
            >
              {enabled ? "Pause" : "Enable daily"}
            </button>
          }
        />
      </section>

      {!ready && (
        <p className="text-sm text-[color:var(--muted)] rise-delay">
          Connect YouTube and finish AI training before enabling daily publishing.
        </p>
      )}

      <section className="panel rise-delay p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Recent content</h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Latest jobs. Full queue and history are in{" "}
              <Link href="/dashboard/content" className="text-[color:var(--accent)]">
                Content
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/content" className="btn btn-ghost text-sm">
              Open Content
            </Link>
            <button
              className="btn btn-primary text-sm"
              disabled={!ready || busy === "generate"}
              onClick={generateNow}
            >
              {busy === "generate" ? "Queuing…" : "Generate 1 Short now"}
            </button>
          </div>
        </div>

        {message && (
          <p className="mt-4 text-sm text-[color:var(--accent)]">{message}</p>
        )}

        <ul className="mt-6 divide-y divide-[color:var(--line)]">
          {jobs.length === 0 && (
            <li className="py-6 text-sm text-[color:var(--muted)]">
              No content yet.
            </li>
          )}
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: `${statusColor(job.status)}22`,
                      color: statusColor(job.status),
                    }}
                  >
                    {JOB_STATUS_LABEL[job.status] || job.status}
                  </span>
                  <p className="font-medium">{job.title || "Untitled Short"}</p>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
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
                  Open Short
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatusBlock({
  title,
  ok,
  detail,
  action,
}: {
  title: string;
  ok: boolean;
  detail: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: ok ? "var(--success)" : "var(--muted)",
            animation: ok ? "pulse-soft 2.4s ease infinite" : undefined,
          }}
        />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-[color:var(--muted)]">{detail}</p>
      <div className="mt-auto">{action}</div>
    </div>
  );
}
