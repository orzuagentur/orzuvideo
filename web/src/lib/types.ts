export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  youtube_connected: boolean;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
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
  voice_id: string;
  subtitle_style: string;
  duration_seconds: number;
  is_trained: boolean;
};

export type VideoJob = {
  id: string;
  status: string;
  title: string | null;
  script_text: string | null;
  youtube_url: string | null;
  error_message: string | null;
  scheduled_for: string;
  created_at: string;
  completed_at: string | null;
};
