import type { SupabaseClient } from "@supabase/supabase-js";

const PERMANENT_ERROR_SNIPPETS = [
  "youtube is not connected",
  "unauthorized",
  "no platform music",
  "library empty",
  "training required",
  "fill required",
] as const;

function isPermanentError(errorMessage: string | null | undefined): boolean {
  const err = String(errorMessage || "").toLowerCase();
  if (!err) return false;
  return PERMANENT_ERROR_SNIPPETS.some((s) => err.includes(s));
}

type FailedJobRow = {
  id: string;
  attempt_count: number | null;
  metadata: Record<string, unknown> | string | null;
  error_message: string | null;
  updated_at: string | null;
};

function asMeta(
  raw: FailedJobRow["metadata"],
): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

/**
 * Auto-repair: re-queue failed video_jobs after a cooldown.
 * Skips permanent config errors and jobs that already exhausted retries.
 */
export async function requeueFailedJobs(
  sb: SupabaseClient,
  opts?: {
    maxAttempts?: number;
    cooldownMinutes?: number;
    limit?: number;
    maxAutoRetries?: number;
  },
): Promise<{ requeued: number; ids: string[] }> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const cooldownMinutes = opts?.cooldownMinutes ?? 15;
  const limit = opts?.limit ?? 20;
  const maxAutoRetries = opts?.maxAutoRetries ?? 2;

  const cutoff = new Date(
    Date.now() - cooldownMinutes * 60 * 1000,
  ).toISOString();

  const { data, error } = await sb
    .from("video_jobs")
    .select("id,attempt_count,metadata,error_message,updated_at")
    .eq("status", "failed")
    .lt("attempt_count", maxAttempts)
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[RETRY] list failed jobs:", error.message);
    return { requeued: 0, ids: [] };
  }

  const ids: string[] = [];
  for (const row of (data || []) as FailedJobRow[]) {
    if (isPermanentError(row.error_message)) continue;

    const meta = asMeta(row.metadata);
    const autoRetries = Number(meta.auto_retries || 0);
    if (!Number.isFinite(autoRetries) || autoRetries >= maxAutoRetries) {
      continue;
    }

    const newMeta = {
      ...meta,
      auto_retries: autoRetries + 1,
      auto_requeued_at: new Date().toISOString(),
      previous_error: String(row.error_message || "").slice(0, 500),
      auto_repair: true,
    };

    const { data: updated, error: updErr } = await sb
      .from("video_jobs")
      .update({
        status: "queued",
        error_message: null,
        scheduled_for: new Date().toISOString(),
        metadata: newMeta,
      })
      .eq("id", row.id)
      .eq("status", "failed")
      .select("id");

    if (updErr) {
      console.error(`[RETRY] requeue ${row.id}:`, updErr.message);
      continue;
    }
    if (updated?.length) {
      ids.push(row.id);
    }
  }

  return { requeued: ids.length, ids };
}

const STUCK_STATUSES = [
  "generating_script",
  "generating_voice",
  "fetching_media",
  "editing",
  "uploading",
] as const;

/**
 * Jobs stuck mid-pipeline (worker crash / timeout) → back to queued.
 */
export async function requeueStuckJobs(
  sb: SupabaseClient,
  opts?: {
    staleMinutes?: number;
    maxAttempts?: number;
    limit?: number;
  },
): Promise<{ requeued: number; ids: string[] }> {
  const staleMinutes = opts?.staleMinutes ?? 45;
  const maxAttempts = opts?.maxAttempts ?? 3;
  const limit = opts?.limit ?? 10;
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("video_jobs")
    .select("id,attempt_count,metadata,updated_at,status")
    .in("status", [...STUCK_STATUSES])
    .lt("attempt_count", maxAttempts)
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[RETRY] list stuck jobs:", error.message);
    return { requeued: 0, ids: [] };
  }

  const ids: string[] = [];
  for (const row of data || []) {
    const meta = asMeta(row.metadata as FailedJobRow["metadata"]);
    const stuckRetries = Number(meta.stuck_retries || 0);
    if (stuckRetries >= 2) continue;

    const newMeta = {
      ...meta,
      stuck_retries: stuckRetries + 1,
      stuck_requeued_at: new Date().toISOString(),
      stuck_from_status: row.status,
      auto_repair: true,
    };

    const { data: updated, error: updErr } = await sb
      .from("video_jobs")
      .update({
        status: "queued",
        error_message: null,
        scheduled_for: new Date().toISOString(),
        metadata: newMeta,
      })
      .eq("id", row.id)
      .in("status", [...STUCK_STATUSES])
      .select("id");

    if (updErr) {
      console.error(`[RETRY] stuck requeue ${row.id}:`, updErr.message);
      continue;
    }
    if (updated?.length) ids.push(row.id);
  }

  return { requeued: ids.length, ids };
}
