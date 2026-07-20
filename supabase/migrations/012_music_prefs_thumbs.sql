-- Music prefs on AI Training + thumbnails bucket support
alter table public.ai_training
  add column if not exists music_group text default '',
  add column if not exists music_volume numeric default 0.58,
  add column if not exists voice_volume numeric default 1.05,
  add column if not exists music_prefs jsonb not null default '{}'::jsonb;

comment on column public.ai_training.music_group is
  'Built-in or custom music group id used by the worker';
comment on column public.ai_training.music_volume is
  'Background music volume 0.15–1.0 (body level)';
comment on column public.ai_training.voice_volume is
  'Narration / ElevenLabs mix volume 0.5–1.4';
comment on column public.ai_training.music_prefs is
  'JSON: selected_track_ids, custom_groups[{id,name,tracks}], voice_volume';

-- Allow JPEG/PNG thumbs next to MP4 previews in short-previews
update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[]
where id = 'short-previews';
