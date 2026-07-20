/** Supabase Storage layout for platform / Creativity videos */
export const PREVIEW_BUCKET = "short-previews";
export const AUDIO_BUCKET = "ig-audio";

export function previewObjectPath(userId: string, jobId: string): string {
  return `${userId}/${jobId}.mp4`;
}
