"use client";

import { useMemo, useState } from "react";
import type { VideoJob } from "@/lib/types";
import {
  JOB_STATUS_LABEL,
  QUEUE_STATUSES,
  statusColor,
} from "@/lib/job-status";

type Filter = "all" | "queue" | "published" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "queue", label: "Queue / processing" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

export function ContentList({ jobs }: { jobs: VideoJob[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      queue: jobs.filter((j) => QUEUE_STATUSES.has(j.status)).length,
      published: jobs.filter((j) => j.status === "published").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    };
  }, [jobs]);

  const filtered = useMemo(() => {
    if (filter === "queue") {
      return jobs.filter((j) => QUEUE_STATUSES.has(j.status));
    }
    if (filter === "published") {
      return jobs.filter((j) => j.status === "published");
    }
    if (filter === "failed") {
      return jobs.filter((j) => j.status === "failed");
    }
    return jobs;
  }, [jobs, filter]);

  return (
    <div className="space-y-6">
      <section className="panel rise p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Content</h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              All generated Shorts, queue, and publishing history.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[color:var(--muted)]">
            <span>{counts.queue} in queue</span>
            <span>·</span>
            <span>{counts.published} published</span>
            <span>·</span>
            <span>{counts.failed} failed</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-full px-3 py-1.5 text-sm transition"
                style={{
                  background: active
                    ? "rgba(232,165,75,0.16)"
                    : "rgba(255,255,255,0.03)",
                  color: active ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${active ? "rgba(232,165,75,0.45)" : "var(--line)"}`,
                }}
              >
                {f.label}
                <span className="ml-1.5 opacity-70">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel rise-delay overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-[color:var(--muted)]">
            No content in this filter yet.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--line)]">
            {filtered.map((job) => {
              const open = expandedId === job.id;
              return (
                <li key={job.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            background: `${statusColor(job.status)}22`,
                            color: statusColor(job.status),
                          }}
                        >
                          {JOB_STATUS_LABEL[job.status] || job.status}
                        </span>
                        <h2 className="font-medium">
                          {job.title || "Untitled Short"}
                        </h2>
                      </div>
                      <p className="mt-2 text-xs text-[color:var(--muted)]">
                        Created {new Date(job.created_at).toLocaleString()}
                        {job.scheduled_for
                          ? ` · Scheduled ${new Date(job.scheduled_for).toLocaleString()}`
                          : ""}
                        {job.completed_at
                          ? ` · Done ${new Date(job.completed_at).toLocaleString()}`
                          : ""}
                      </p>
                      {job.script_text && (
                        <p className="mt-3 line-clamp-2 text-sm text-[color:var(--muted)]">
                          {job.script_text}
                        </p>
                      )}
                      {job.error_message && (
                        <p className="mt-2 line-clamp-3 text-xs text-[color:var(--danger)]">
                          {job.error_message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {job.youtube_url && (
                        <a
                          href={job.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary text-xs"
                        >
                          Open Short
                        </a>
                      )}
                      {(job.script_text || job.error_message) && (
                        <button
                          type="button"
                          className="btn btn-ghost text-xs"
                          onClick={() =>
                            setExpandedId(open ? null : job.id)
                          }
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--line)] bg-black/20 p-4">
                      {job.script_text && (
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--muted)]">
                            Script
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {job.script_text}
                          </p>
                        </div>
                      )}
                      {job.error_message && (
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--danger)]">
                            Error
                          </p>
                          <p className="whitespace-pre-wrap text-xs text-[color:var(--danger)]">
                            {job.error_message}
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-[color:var(--muted)]">
                        ID: {job.id}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
