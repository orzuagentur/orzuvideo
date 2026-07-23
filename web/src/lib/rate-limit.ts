/**
 * Simple in-memory rate limiter for auth endpoints.
 * Resets on server restart — enough to slow brute-force on a single instance.
 */

type Bucket = {
  hits: number;
  resetAt: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 8;
const LOCK_MS = 15 * 60 * 1000;

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt < now && b.lockedUntil < now) buckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; error: string };

/** Check + optionally record a hit. Use record=false for peek before work. */
export function checkRateLimit(
  key: string,
  opts?: { maxHits?: number; windowMs?: number; lockMs?: number },
): RateLimitResult {
  const maxHits = opts?.maxHits ?? MAX_HITS;
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const lockMs = opts?.lockMs ?? LOCK_MS;
  const now = Date.now();
  prune(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { hits: 0, resetAt: now + windowMs, lockedUntil: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.lockedUntil > now) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.lockedUntil - now) / 1000),
      error: "Too many attempts. Try again later.",
    };
  }

  bucket.hits += 1;
  if (bucket.hits > maxHits) {
    bucket.lockedUntil = now + lockMs;
    return {
      ok: false,
      retryAfterSec: Math.ceil(lockMs / 1000),
      error: "Too many attempts. Try again later.",
    };
  }

  return { ok: true, remaining: Math.max(0, maxHits - bucket.hits) };
}

/** Clear successes so legitimate users are not locked after one typo streak. */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}
