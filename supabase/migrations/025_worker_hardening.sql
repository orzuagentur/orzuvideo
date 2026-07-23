-- Worker queue hardening: atomic claims, leases, idempotent publish records.

alter table public.video_jobs
  add column if not exists worker_run_id uuid,
  add column if not exists worker_id text,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists youtube_upload_started_at timestamptz,
  add column if not exists youtube_upload_finished_at timestamptz;

create index if not exists video_jobs_due_claim_idx
  on public.video_jobs (scheduled_for, created_at)
  where status = 'queued';

create index if not exists video_jobs_lease_idx
  on public.video_jobs (status, lease_expires_at)
  where status in ('generating_script', 'generating_voice', 'fetching_media', 'editing');

create index if not exists video_jobs_schedule_slot_idx
  on public.video_jobs (
    user_id,
    coalesce(youtube_channel_id, ''),
    ((metadata ->> 'schedule_slot'))
  )
  where metadata ? 'schedule_slot';

with ranked as (
  select
    id,
    row_number() over (
      partition by job_id
      order by published_at desc nulls last, id desc
    ) as rn
  from public.published_videos
  where job_id is not null
)
delete from public.published_videos p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists published_videos_job_uidx
  on public.published_videos (job_id)
  where job_id is not null;

create or replace function public.claim_next_video_job(
  p_worker_id text,
  p_lease_seconds integer default 7200
)
returns setof public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_run_id uuid := gen_random_uuid();
begin
  select id
    into v_job_id
  from public.video_jobs
  where status = 'queued'
    and scheduled_for <= now()
  order by scheduled_for asc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.video_jobs
  set
    status = 'generating_script',
    attempt_count = attempt_count + 1,
    worker_run_id = v_run_id,
    worker_id = coalesce(nullif(p_worker_id, ''), 'unknown'),
    claimed_at = now(),
    lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
    error_message = null
  where id = v_job_id
    and status = 'queued'
  returning *;
end;
$$;

grant execute on function public.claim_next_video_job(text, integer) to service_role;
