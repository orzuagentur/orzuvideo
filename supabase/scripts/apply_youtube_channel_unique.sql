-- One YouTube channel → one OrzuAi account
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
