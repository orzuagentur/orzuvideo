-- One YouTube channel can belong to only one OrzuAi account.
-- Keep the oldest row when duplicates exist.

with ranked as (
  select
    id,
    row_number() over (
      partition by channel_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.youtube_channels
)
delete from public.youtube_channels yc
using ranked r
where yc.id = r.id
  and r.rn > 1;

create unique index if not exists youtube_channels_channel_id_uidx
  on public.youtube_channels (channel_id);

comment on index public.youtube_channels_channel_id_uidx is
  'Ensures a YouTube channel is linked to at most one OrzuAi account';
