/**
 * Canonical production domain for OrzuAi.
 * Local/dev still uses NEXT_PUBLIC_APP_URL from .env.local (localhost).
 */
export const PRODUCTION_APP_URL = "https://orzuai.com";
export const PRODUCTION_WWW_URL = "https://www.orzuai.com";
export const PRODUCTION_MEDIA_URL = "https://media.orzuai.com";

export function appUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_APP_URL;
  return "http://localhost:3000";
}

export function youtubeRedirectUri(): string {
  const fromEnv = (process.env.YOUTUBE_REDIRECT_URI || "").trim();
  if (fromEnv) return fromEnv;
  return `${appUrl()}/api/youtube/callback`;
}
