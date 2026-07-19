export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "In queue",
  generating_script: "Writing script",
  generating_voice: "Generating voice",
  fetching_media: "Fetching footage",
  editing: "Editing",
  uploading: "Uploading",
  published: "Published",
  failed: "Failed",
};

export const QUEUE_STATUSES = new Set([
  "queued",
  "generating_script",
  "generating_voice",
  "fetching_media",
  "editing",
  "uploading",
]);

export function statusColor(status: string): string {
  if (status === "published") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  if (status === "queued") return "var(--accent)";
  return "#7eb6ff";
}
