/**
 * Media object layout in Cloudflare R2.
 * Supabase stores only metadata (paths/URLs), never the binary files.
 *
 * The real bucket name comes from server env `R2_BUCKET` (presign / upload APIs).
 * This constant is the default label stored in DB / used by the client.
 */

export const MEDIA_BUCKET = "orzu-media";

/** @deprecated use MEDIA_BUCKET */
export const PREVIEW_BUCKET = MEDIA_BUCKET;

export function previewObjectPath(userId: string, jobId: string): string {
  return `${userId}/${jobId}.mp4`;
}

export function thumbObjectPath(userId: string, jobId: string): string {
  return `${userId}/${jobId}_thumb.jpg`;
}

export function clippingSourcePath(
  userId: string,
  jobId: string,
  index: number,
): string {
  return `${userId}/clipping/${jobId}/source_${index}.mp4`;
}

export function clippingFolderPrefix(userId: string, jobId: string): string {
  return `${userId}/clipping/${jobId}`;
}
