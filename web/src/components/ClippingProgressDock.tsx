"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VideoJob } from "@/lib/types";
import {
  QUEUE_STATUSES,
  jobProgressPercent,
  statusColor,
} from "@/lib/job-status";

function isClippingJob(job: VideoJob) {
  const src = String(job.metadata?.source || "").toLowerCase();
  const pipe = String(job.metadata?.pipeline || "").toLowerCase();
  if (src === "reedit" || pipe === "reedit") {
    return String(job.metadata?.library || "") === "clipping";
  }
  return src === "ai_clipping" || pipe === "ai_clipping" || src === "clipping";
}

function isProgressDockJob(job: VideoJob) {
  const src = String(job.metadata?.source || "").toLowerCase();
  const pipe = String(job.metadata?.pipeline || "").toLowerCase();
  if (src === "reedit" || pipe === "reedit") return true;
  return isClippingJob(job);
}

function clipStatusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "In queue";
    case "generating_script":
      return "Analyzing";
    case "generating_voice":
      return "Captions";
    case "fetching_media":
      return "Music";
    case "editing":
      return "Editing";
    case "uploading":
      return "Saving";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

/**
 * Global bottom-right status for AI Clipping jobs — stays visible across dashboard.
 */
export function ClippingProgressDock() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("video_jobs")
      .select(
        "id,status,title,error_message,created_at,completed_at,preview_url,duration_seconds,metadata",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (data) setJobs((data as VideoJob[]).filter(isProgressDockJob));
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const active = useMemo(
    () =>
      jobs.filter(
        (j) => QUEUE_STATUSES.has(j.status) && !dismissed.has(j.id),
      ),
    [jobs, dismissed],
  );

  const recentDone = useMemo(() => {
    const cutoff = Date.now() - 45_000;
    return jobs.filter((j) => {
      if (dismissed.has(j.id)) return false;
      if (j.status !== "ready" && j.status !== "failed") return false;
      const ts = new Date(j.completed_at || j.created_at).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [jobs, dismissed]);

  const visible = active.length > 0 ? active : recentDone.slice(0, 2);
  if (visible.length === 0) return null;

  const primary = visible[0];
  const pct = jobProgressPercent(primary.status);
  const busy = QUEUE_STATUSES.has(primary.status);

  return (
    <div className="fixed bottom-4 right-4 z-[85] w-[min(100%-2rem,300px)] sm:bottom-6 sm:right-6">
      <div
        className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]/95 shadow-2xl backdrop-blur-md"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-3 py-2">
          <Link
            href="/dashboard/clipping"
            className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
          >
            AI Clipping
          </Link>
          <button
            type="button"
            className="text-xs text-[color:var(--muted)] hover:text-[color:var(--fg)]"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▴" : "▾"}
          </button>
          {!busy && (
            <button
              type="button"
              className="text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
              aria-label="Dismiss"
              onClick={() =>
                setDismissed((prev) => {
                  const next = new Set(prev);
                  visible.forEach((j) => next.add(j.id));
                  return next;
                })
              }
            >
              ×
            </button>
          )}
        </div>

        {!collapsed && (
          <ul className="max-h-56 space-y-2 overflow-y-auto p-3">
            {visible.map((job) => {
              const p = jobProgressPercent(job.status);
              return (
                <li key={job.id}>
                  <Link
                    href="/dashboard/clipping"
                    className="block rounded-xl px-1 py-0.5 transition hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {job.title || "AI Clip"}
                      </p>
                      <span
                        className="shrink-0 text-[11px] font-semibold tabular-nums"
                        style={{ color: statusColor(job.status) }}
                      >
                        {QUEUE_STATUSES.has(job.status) ? `${p}%` : clipStatusLabel(job.status)}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: statusColor(job.status) }}
                    >
                      {clipStatusLabel(job.status)}
                      {job.status === "failed" && job.error_message
                        ? ` — ${job.error_message.slice(0, 60)}`
                        : ""}
                    </p>
                    {QUEUE_STATUSES.has(job.status) && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${p}%`,
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {collapsed && (
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-semibold">
                {primary.title || "AI Clip"}
              </span>
              <span
                className="tabular-nums text-xs font-semibold"
                style={{ color: statusColor(primary.status) }}
              >
                {busy ? `${pct}%` : clipStatusLabel(primary.status)}
              </span>
            </div>
            {busy && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: "var(--accent)" }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
