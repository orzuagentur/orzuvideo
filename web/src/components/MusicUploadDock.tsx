"use client";

import { useMusicUpload } from "@/components/MusicUploadProvider";

/**
 * Bottom-right music upload progress — survives navigating away from /music.
 */
export function MusicUploadDock() {
  const { jobs, dismissJob } = useMusicUpload();
  const cards = jobs.slice(0, 3);
  if (!cards.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-[90] flex w-[min(100vw-1.5rem,320px)] flex-col gap-2 sm:right-4 lg:bottom-28 lg:right-6">
      {cards.map((job) => {
        const pct = job.pct ?? 0;
        const running = job.status === "running";
        return (
          <div
            key={job.id}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {running ? "Uploading music" : job.status === "error" ? "Upload failed" : "Upload complete"}
                </p>
                <p className="truncate text-xs text-[color:var(--muted)]">
                  {job.genreName}
                </p>
              </div>
              {(job.status === "done" || job.status === "error") && (
                <button
                  type="button"
                  onClick={() => dismissJob(job.id)}
                  className="text-xs text-[color:var(--muted)] hover:text-[color:var(--fg)]"
                >
                  Close
                </button>
              )}
            </div>

            {running && (
              <div className="px-3.5 pb-2 pt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[color:var(--accent)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[color:var(--muted)]">
                  {pct}% · {job.processed} / {job.total} files
                  {job.folderDuplicates > 0
                    ? ` · ${job.folderDuplicates} dup in folder`
                    : ""}
                  {job.skipped > 0 ? ` · ${job.skipped} in library` : ""}
                </p>
              </div>
            )}

            {(job.status === "done" || job.status === "error") && (
              <div className="space-y-0.5 px-3.5 pb-3 pt-1 text-xs text-[color:var(--muted)]">
                {job.status === "error" && job.error ? (
                  <p className="text-[color:var(--danger)]">{job.error}</p>
                ) : (
                  <>
                    <p>
                      Uploaded:{" "}
                      <span className="text-[color:var(--fg)]">{job.uploaded}</span>
                    </p>
                    {(job.folderDuplicates ?? 0) > 0 && (
                      <p>
                        Duplicates in folder (kept 1 each):{" "}
                        <span className="text-[color:var(--fg)]">
                          {job.folderDuplicates}
                        </span>
                      </p>
                    )}
                    <p>
                      Already in library:{" "}
                      <span className="text-[color:var(--fg)]">{job.skipped}</span>
                    </p>
                    {job.failed > 0 && (
                      <p>
                        Failed:{" "}
                        <span className="text-[color:var(--danger)]">
                          {job.failed}
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
