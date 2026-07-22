import { r2Configured, signedGetUrl } from "@/lib/r2";

/**
 * Prefer a short-lived R2 signed URL so admin (separate domain) can play
 * library files even when the public CDN blocks hotlinking / referrers.
 */
export async function playableObjectUrl(
  storagePath: string | null | undefined,
  publicUrl: string | null | undefined,
): Promise<string | null> {
  const key = String(storagePath || "")
    .trim()
    .replace(/^\/+/, "");
  if (key && r2Configured()) {
    try {
      return await signedGetUrl(key, 60 * 60 * 12);
    } catch {
      /* fall through to public URL */
    }
  }
  const pub = String(publicUrl || "").trim();
  return pub || null;
}

export async function mapPlayableUrls<
  T extends {
    storage_path?: string | null;
    public_url?: string | null;
  },
>(
  rows: T[],
): Promise<Array<T & { playUrl: string | null }>> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      playUrl: await playableObjectUrl(row.storage_path, row.public_url),
    })),
  );
}
