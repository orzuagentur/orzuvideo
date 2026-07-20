export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "In queue",
  generating_script: "Writing script",
  generating_voice: "Generating voice",
  fetching_media: "Fetching footage",
  editing: "Editing",
  uploading: "Uploading",
  ready: "Ready",
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
  if (status === "ready") return "var(--accent)";
  if (status === "failed") return "var(--danger)";
  if (status === "queued") return "var(--accent)";
  return "#7eb6ff";
}

/** Approximate pipeline progress for Creativity UI. */
export function jobProgressPercent(status: string): number {
  switch (status) {
    case "queued":
      return 8;
    case "generating_script":
      return 22;
    case "generating_voice":
      return 42;
    case "fetching_media":
      return 58;
    case "editing":
      return 78;
    case "uploading":
      return 92;
    case "ready":
    case "published":
      return 100;
    case "failed":
      return 0;
    default:
      return 5;
  }
}
