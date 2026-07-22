export type SourceCategory =
  | "database"
  | "storage"
  | "media"
  | "ai"
  | "voice"
  | "publish"
  | "hosting"
  | "render"
  | "assets"
  | "legacy";

export type SourceEntry = {
  id: string;
  name: string;
  tagline: string;
  category: SourceCategory;
  categoryLabel: string;
  website: string;
  usedIn: string[];
  purpose: string;
  details: string[];
  envKeys: string[];
  status: "active" | "legacy" | "infra";
};

export const SOURCES: SourceEntry[] = [
  {
    id: "supabase",
    name: "Supabase",
    tagline: "Auth, Postgres, and app data",
    category: "database",
    categoryLabel: "Database & Auth",
    website: "https://supabase.com",
    usedIn: ["Web app", "Admin", "Worker"],
    purpose:
      "Primary backend: user accounts, profiles (including is_admin), video jobs, music metadata, favorites, usage/costs, and Row Level Security.",
    details: [
      "Email/password auth for clients and admins.",
      "profiles.is_admin gates the separate admin console.",
      "music_genres / music_tracks store the shared platform music catalog (is_platform).",
      "video_jobs and related tables drive Creativity / daily pipelines.",
      "Service role is used by admin APIs and the Python worker; anon key is used by browsers.",
    ],
    envKeys: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL (worker)",
    ],
    status: "active",
  },
  {
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    tagline: "Object storage for video & music files",
    category: "storage",
    categoryLabel: "Storage",
    website: "https://www.cloudflare.com/developer-platform/r2/",
    usedIn: ["Web app", "Admin", "Worker"],
    purpose:
      "All large binary media lives in R2: finished videos, thumbnails, uploaded music tracks. Supabase holds only metadata and URLs.",
    details: [
      "Bucket default: orzu-media (R2_BUCKET).",
      "Public CDN base: R2_PUBLIC_BASE_URL (e.g. media.orzuai.com).",
      "Admin uses signed GET URLs so playback works from the admin domain.",
      "Music uploads go through presigned PUT then register rows in music_tracks.",
      "Worker uploads rendered MP4s and assets via boto3 / S3 API.",
    ],
    envKeys: [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
      "R2_ENDPOINT",
      "R2_REGION",
    ],
    status: "active",
  },
  {
    id: "pexels",
    name: "Pexels",
    tagline: "Stock video & photo footage",
    category: "media",
    categoryLabel: "Stock media",
    website: "https://www.pexels.com/api/",
    usedIn: ["Web Media studio", "Admin Media", "Worker"],
    purpose:
      "Search and download royalty-free clips used as B-roll in generated videos and in the Media browser.",
    details: [
      "Queried from Media search APIs and from the worker during job render.",
      "Script generation can suggest Pexels search queries.",
      "Downloaded / referenced assets can be bookmarked in favorites.",
    ],
    envKeys: ["PEXELS_API_KEY"],
    status: "active",
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "Scripts, hooks, and comment replies",
    category: "ai",
    categoryLabel: "AI",
    website: "https://platform.openai.com",
    usedIn: ["Worker", "Web (YouTube comments API)"],
    purpose:
      "LLM for video scripts, hooks, music mood hints, and AI replies to YouTube comments.",
    details: [
      "Default model: gpt-4o-mini (OPENAI_MODEL).",
      "Worker scriptgen builds Creativity / daily video copy.",
      "Usage and estimated cost are logged for the Expenses screen.",
      "Web can call OpenAI for comment drafts when enabled.",
    ],
    envKeys: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    status: "active",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    tagline: "Text-to-speech voiceovers",
    category: "voice",
    categoryLabel: "Voice",
    website: "https://elevenlabs.io",
    usedIn: ["Worker"],
    purpose:
      "Turns script text into spoken audio beds that are mixed into the final video.",
    details: [
      "Voice id configurable via ELEVENLABS_VOICE_ID.",
      "Character usage is tracked for Expenses.",
      "Runs only on the worker machine during render.",
    ],
    envKeys: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"],
    status: "active",
  },
  {
    id: "youtube",
    name: "YouTube",
    tagline: "OAuth publish & channel tools",
    category: "publish",
    categoryLabel: "Publishing",
    website: "https://developers.google.com/youtube",
    usedIn: ["Web app", "Worker"],
    purpose:
      "Connect a channel, upload/publish videos, and manage comments / training against the user’s YouTube account.",
    details: [
      "OAuth connect + callback on the client site.",
      "Tokens stored per profile for worker uploads.",
      "YOUTUBE_REDIRECT_URI must match the live domain (www.orzuai.com).",
    ],
    envKeys: [
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_REDIRECT_URI",
    ],
    status: "active",
  },
  {
    id: "vercel",
    name: "Vercel",
    tagline: "Hosts web + admin Next.js apps",
    category: "hosting",
    categoryLabel: "Hosting",
    website: "https://vercel.com",
    usedIn: ["orzuai.com", "orzuvideo-admin"],
    purpose:
      "Serverless hosting for the customer web app and the isolated admin project (same GitHub repo, different Root Directory).",
    details: [
      "Client root: web/",
      "Admin root: admin/ → orzuvideo-admin.vercel.app",
      "Env vars are configured separately per Vercel project.",
      "Also runs scheduled cron routes when CRON_SECRET / Vercel Cron is set.",
    ],
    envKeys: ["CRON_SECRET", "NEXT_PUBLIC_APP_URL", "VERCEL"],
    status: "infra",
  },
  {
    id: "railway",
    name: "Railway",
    tagline: "Long-running video worker",
    category: "hosting",
    categoryLabel: "Hosting",
    website: "https://railway.app",
    usedIn: ["Worker (Python)"],
    purpose:
      "Runs the OrzuVideo worker that polls jobs, downloads media, synthesizes voice, renders with FFmpeg, and uploads results to R2 / YouTube.",
    details: [
      "Needs the same Supabase service role + R2 + OpenAI + ElevenLabs + Pexels keys as production.",
      "Poll interval via POLL_INTERVAL_SEC.",
      "Temp disk for intermediate media during render.",
    ],
    envKeys: [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "POLL_INTERVAL_SEC",
      "TEMP_DIR",
    ],
    status: "infra",
  },
  {
    id: "ffmpeg",
    name: "FFmpeg",
    tagline: "Local video / audio assembly",
    category: "render",
    categoryLabel: "Render",
    website: "https://ffmpeg.org",
    usedIn: ["Worker"],
    purpose:
      "Cuts, overlays, mixes voice + music, and encodes the final MP4 on the worker host.",
    details: [
      "Must be installed on the machine running the worker.",
      "Used across montage / clipping / thumbnail pipelines.",
      "Not a cloud SaaS — binary dependency on Railway/local.",
    ],
    envKeys: [],
    status: "infra",
  },
  {
    id: "poly-haven",
    name: "Poly Haven",
    tagline: "CC0 3D / HDR / texture assets",
    category: "assets",
    categoryLabel: "Assets",
    website: "https://polyhaven.com",
    usedIn: ["Web Creators studio"],
    purpose:
      "Optional browser for free Poly Haven models, HDRIs, and textures for creators exploring assets.",
    details: [
      "Public Poly Haven API (no paid key in repo).",
      "Used from the Creators / Poly Haven UI on the client site.",
      "Not required for core video generation.",
    ],
    envKeys: [],
    status: "active",
  },
  {
    id: "platform-music",
    name: "Platform music library",
    tagline: "Shared R2 music catalog for all videos",
    category: "media",
    categoryLabel: "Stock media",
    website: "/music",
    usedIn: ["Admin Music", "Worker background beds"],
    purpose:
      "Admin-curated genres and tracks stored in R2 + music_* tables. Every video job picks from this shared is_platform catalog.",
    details: [
      "Managed only in the admin Music section.",
      "Any admin account sees and extends the same library.",
      "Worker falls back to per-user library only if is_platform is missing.",
      "Duplicates are skipped via file_hash across the platform catalog.",
    ],
    envKeys: ["(same as Cloudflare R2 + Supabase)"],
    status: "active",
  },
  {
    id: "jamendo",
    name: "Jamendo",
    tagline: "Legacy stock music API",
    category: "legacy",
    categoryLabel: "Legacy",
    website: "https://developer.jamendo.com",
    usedIn: ["Deprecated"],
    purpose:
      "Previously used for stock music previews. Replaced by the platform R2 music library.",
    details: [
      "Worker jamendo module is a compatibility shim.",
      "JAMENDO_CLIENT_ID may still appear in env examples but is not required for new renders.",
      "Keep only if you still have old bookmarks that point at Jamendo URLs.",
    ],
    envKeys: ["JAMENDO_CLIENT_ID"],
    status: "legacy",
  },
];

export function getSource(id: string): SourceEntry | undefined {
  return SOURCES.find((s) => s.id === id);
}
