export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  youtube_connected: boolean;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
  youtube_thumbnail_url?: string | null;
  youtube_custom_url?: string | null;
  youtube_banner_url?: string | null;
  youtube_subscriber_count?: number | null;
  youtube_view_count?: number | null;
  youtube_video_count?: number | null;
  youtube_like_count?: number | null;
  youtube_comment_count?: number | null;
  youtube_stats_synced_at?: string | null;
  daily_videos_enabled: boolean;
  videos_per_day: number;
};

export type AiTraining = {
  id?: string;
  user_id?: string;
  niche: string;
  content_type: string;
  style_prompt: string;
  tone: string;
  language: string;
  target_audience: string;
  hook_style: string;
  cta: string;
  pexels_query: string;
  music_mood: string;
  music_group?: string;
  music_volume?: number;
  voice_volume?: number;
  music_prefs?: {
    active_group_id?: string;
    volume?: number;
    voice_volume?: number;
    selected_track_ids?: string[];
    custom_groups?: Array<{
      id: string;
      name: string;
      tracks: Array<{
        id: string;
        name: string;
        artist: string;
        previewUrl: string | null;
        thumb?: string | null;
        durationSec?: number | null;
      }>;
    }>;
  } | null;
  voice_id: string;
  subtitle_style: string;
  duration_seconds: number;
  video_format: string;
  video_style: string;
  reply_comments_enabled: boolean;
  reply_languages: string;
  reply_style_prompt: string;
  learning_enabled: boolean;
  brand_rules: string;
  is_trained: boolean;
};

export type VideoJob = {
  id: string;
  status: string;
  title: string | null;
  script_text: string | null;
  description?: string | null;
  youtube_url: string | null;
  youtube_video_id?: string | null;
  error_message: string | null;
  scheduled_for: string;
  created_at: string;
  completed_at: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  duration_seconds?: number | null;
  storage_path?: string | null;
  storage_bucket?: string | null;
  metadata?: {
    publish?: boolean;
    source?: string;
    user_brief?: string;
    duration_seconds?: number | null;
    duration_auto?: boolean;
    aspect_ratio?: string;
    [key: string]: unknown;
  } | null;
};

export type PublishSchedule = {
  id?: string;
  user_id?: string;
  enabled: boolean;
  mode: "daily" | "weekdays" | "custom_days" | "dates";
  videos_per_day: number;
  times: string[];
  weekdays: number[];
  custom_dates: string[];
  timezone: string;
};

export type UsageEvent = {
  id: string;
  provider: string;
  kind: string;
  units: number;
  unit_label: string;
  cost_usd: number;
  meta: Record<string, unknown>;
  created_at: string;
  job_id?: string | null;
};

export type DashboardStats = {
  published: number;
  queued: number;
  processing: number;
  failed: number;
  total: number;
  costUsdMonth: number;
};
