/** Static n8n-style map of OrzuVideo pipeline nodes + explanations. */

export type NodeKind =
  | "trigger"
  | "queue"
  | "worker"
  | "ai"
  | "media"
  | "edit"
  | "output"
  | "account";

export type FlowNodeDef = {
  id: string;
  label: string;
  kind: NodeKind;
  short: string;
  /** grid position */
  col: number;
  row: number;
  title: string;
  how: string;
  connects: string[];
  needs: string[];
  tips: string[];
  integrationId?: string;
};

export type FlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export const FLOW_NODES: FlowNodeDef[] = [
  {
    id: "schedule",
    label: "Schedule / Cron",
    kind: "trigger",
    short: "Hourly Vercel tick",
    col: 0,
    row: 0,
    title: "Schedule & Vercel Cron",
    how: "Every hour Vercel calls /api/cron/daily. If your Schedule time matches (timezone, days, slots), it inserts queued jobs into Supabase. This does not render video — it only creates work for the worker.",
    connects: [
      "Requires Schedule enabled in the dashboard",
      "Requires YouTube connected + AI trained",
      "Writes video_jobs with status queued",
    ],
    needs: ["Vercel deployment", "CRON_SECRET (recommended)", "publish_schedules row"],
    tips: [
      "Hobby cron can drift; keep worker running 24/7",
      "Dashboard Generate and Content + bypass the schedule",
    ],
    integrationId: "cron",
  },
  {
    id: "content_plus",
    label: "Content +",
    kind: "trigger",
    short: "Manual draft brief",
    col: 1,
    row: 0,
    title: "Content → + (draft)",
    how: "You write a short brief about the video. The API creates a queued job with metadata.publish=false and your brief. The worker builds the Short but does not upload to YouTube — status becomes ready.",
    connects: ["Uses AI Training style", "Skips YouTube upload", "Stores preview when possible"],
    needs: ["AI Training completed", "Running worker"],
    tips: ["Use Publish on the card later to upload", "YouTube is optional for drafts"],
  },
  {
    id: "generate_now",
    label: "Generate now",
    kind: "trigger",
    short: "Dashboard one-shot",
    col: 2,
    row: 0,
    title: "Dashboard → Generate Short now",
    how: "Creates a queued job with publish=true (default). Worker runs the full pipeline and uploads to YouTube when finished.",
    connects: ["Requires YouTube connected", "Requires AI trained", "Ends in published"],
    needs: ["YouTube OAuth", "Worker online"],
    tips: ["Same pipeline as schedule, just immediate"],
  },
  {
    id: "supabase_queue",
    label: "Supabase Queue",
    kind: "queue",
    short: "video_jobs table",
    col: 1,
    row: 1,
    title: "Supabase job queue",
    how: "All work lives in video_jobs. Status moves: queued → generating_script → generating_voice → fetching_media → editing → uploading/ready → published/failed. The worker claims the oldest due job with an optimistic lock.",
    connects: ["Cron / UI write jobs", "Worker reads & updates", "Dashboard reads for cards"],
    needs: ["SUPABASE_URL", "Service role key on worker"],
    tips: ["scheduled_for controls when a job becomes claimable"],
    integrationId: "supabase",
  },
  {
    id: "worker",
    label: "Python Worker",
    kind: "worker",
    short: "FFmpeg host process",
    col: 1,
    row: 2,
    title: "Python worker (local / Railway)",
    how: "Vercel cannot run FFmpeg. The worker (python main.py) polls Supabase every few seconds, claims jobs, calls APIs, edits video, then publishes or marks ready. Heartbeats write to worker_presence so this panel can show Online.",
    connects: [
      "Pulls training + profile",
      "Orchestrates all downstream nodes",
      "Must stay running for schedule to complete",
    ],
    needs: ["worker/.env filled", "FFmpeg installed", "python main.py"],
    tips: [
      "Ctrl+C stops publishing forever until restart",
      "One worker serves the whole project",
    ],
  },
  {
    id: "training",
    label: "AI Training",
    kind: "account",
    short: "Brand brain",
    col: 3,
    row: 1,
    title: "AI Training profile",
    how: "Your niche, tone, style prompt, music mood, voice, duration, and brand rules. Every script generation loads this row. Without is_trained=true, jobs cannot be created.",
    connects: ["Feeds OpenAI script node", "Sets Pexels / music defaults"],
    needs: ["Complete Train AI once"],
    tips: ["Edit anytime — next jobs use the new style"],
  },
  {
    id: "youtube_auth",
    label: "YouTube Channel",
    kind: "account",
    short: "OAuth + publish target",
    col: 3,
    row: 2,
    title: "YouTube connection",
    how: "OAuth tokens live on your profile. Upload uses youtube.upload scopes. Channel picker stores the Brand Account id. Disconnect clears tokens; Reconnect refreshes consent.",
    connects: ["Required for auto-publish", "Optional for drafts", "Comments API uses same token"],
    needs: ["YOUTUBE_CLIENT_ID/SECRET", "Redirect URI"],
    tips: ["Use Channel → Switch / Reconnect if uploads fail"],
    integrationId: "youtube",
  },
  {
    id: "openai",
    label: "OpenAI Script",
    kind: "ai",
    short: "gpt-4o-mini",
    col: 0,
    row: 3,
    title: "Script generation (OpenAI)",
    how: "Builds JSON: hook, spoken script, title, description, tags, Pexels queries, emphasis words. Respects training + optional user brief. First 3 seconds are forced as a scroll-stop hook.",
    connects: ["Input: training + brief", "Output: script_text on the job"],
    needs: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    tips: ["Costs logged to usage_events"],
    integrationId: "openai",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs TTS",
    kind: "ai",
    short: "Voice + timings",
    col: 1,
    row: 3,
    title: "Voice synthesis (ElevenLabs)",
    how: "Turns the script into MP3 and character/word timings for karaoke captions. Voice id comes from training or ELEVENLABS_VOICE_ID.",
    connects: ["Input: script", "Output: voice.mp3 + WordTiming[]"],
    needs: ["ELEVENLABS_API_KEY", "Voice id"],
    tips: ["Character count drives cost"],
    integrationId: "elevenlabs",
  },
  {
    id: "pexels",
    label: "Pexels B-roll",
    kind: "media",
    short: "5 stock clips",
    col: 2,
    row: 3,
    title: "Stock footage (Pexels)",
    how: "Downloads portrait clips from script pexels_queries (up to 5). These become the visual montage under the voiceover.",
    connects: ["Input: search queries", "Output: mp4 clip files"],
    needs: ["PEXELS_API_KEY"],
    tips: ["Variety of queries = better montage"],
    integrationId: "pexels",
  },
  {
    id: "jamendo",
    label: "Jamendo Music",
    kind: "media",
    short: "Background bed",
    col: 3,
    row: 3,
    title: "Background music (Jamendo)",
    how: "Fetches a royalty-free instrumental bed by mood tags, caches last_bed.mp3, falls back to generated ambient if needed. Mixed under voice with a louder hook open.",
    connects: ["Input: music_mood", "Output: music.mp3"],
    needs: ["JAMENDO_CLIENT_ID"],
    tips: ["Attribution line added to YouTube description"],
    integrationId: "jamendo",
  },
  {
    id: "ffmpeg",
    label: "FFmpeg Montage",
    kind: "edit",
    short: "Pro edit library",
    col: 1,
    row: 4,
    title: "FFmpeg professional montage",
    how: "Normalizes clips to 1080×1920, applies motion presets (punch, push, drift…), stitches with a transition library (wipe, slide, circle, dissolve…), mixes audio, burns karaoke ASS + 3s hook headline.",
    connects: ["Input: clips + voice + music", "Output: short_final.mp4"],
    needs: ["FFmpeg on PATH", "Worker machine"],
    tips: ["This is why Vercel alone cannot finish jobs"],
    integrationId: "ffmpeg",
  },
  {
    id: "preview",
    label: "Preview Storage",
    kind: "output",
    short: "In-app playback",
    col: 2,
    row: 4,
    title: "Supabase Storage preview",
    how: "Uploads the finished MP4 to Supabase Storage bucket short-previews at {user_id}/{job_id}.mp4, sets preview_url + storage_path. Creativity playback uses signed URLs via /api/jobs/[id]/preview.",
    connects: ["Required before status=ready", "Publish-later can re-download this file"],
    needs: ["Service role", "Migration 010_creativity_storage.sql"],
    tips: ["If upload fails the job is marked failed — no empty Ready cards"],
  },
  {
    id: "draft_ready",
    label: "Ready (draft)",
    kind: "output",
    short: "No YouTube yet",
    col: 0,
    row: 5,
    title: "Draft ready status",
    how: "When publish=false, job stops after editing (+ preview). Status ready. You review in Content, then press Publish to queue YouTube upload only.",
    connects: ["From Content + trigger", "To YouTube via Publish button"],
    needs: ["Migration 003 ready enum"],
    tips: ["Filter Content → Drafts"],
  },
  {
    id: "youtube_upload",
    label: "YouTube Upload",
    kind: "output",
    short: "Public Short",
    col: 2,
    row: 5,
    title: "YouTube publish",
    how: "videos.insert with privacy/public settings as configured. Saves youtube_video_id/url, records published_videos, logs usage. Temp work folder is cleaned after success.",
    connects: ["From schedule / Generate now", "Or from draft Publish"],
    needs: ["Valid OAuth tokens", "Connected channel"],
    tips: ["Failed uploads leave status failed with error_message"],
    integrationId: "youtube",
  },
];

export const FLOW_EDGES: FlowEdge[] = [
  { from: "schedule", to: "supabase_queue", label: "insert jobs" },
  { from: "content_plus", to: "supabase_queue", label: "draft job" },
  { from: "generate_now", to: "supabase_queue", label: "publish job" },
  { from: "supabase_queue", to: "worker", label: "claim" },
  { from: "training", to: "openai", label: "style" },
  { from: "worker", to: "openai", label: "1 script" },
  { from: "openai", to: "elevenlabs", label: "2 voice" },
  { from: "elevenlabs", to: "pexels", label: "3 media" },
  { from: "elevenlabs", to: "jamendo" },
  { from: "pexels", to: "ffmpeg", label: "4 edit" },
  { from: "jamendo", to: "ffmpeg" },
  { from: "ffmpeg", to: "preview" },
  { from: "preview", to: "draft_ready", label: "if draft" },
  { from: "preview", to: "youtube_upload", label: "if publish" },
  { from: "youtube_auth", to: "youtube_upload", label: "token" },
  { from: "draft_ready", to: "youtube_upload", label: "Publish btn" },
];
