-- Avatar: store HeyGen character kind for reliable video generate
alter table public.avatar_training
  add column if not exists heygen_character_type text
  default 'avatar';

comment on column public.avatar_training.heygen_character_type is
  'avatar | talking_photo — how worker should address HeyGen character payload';
