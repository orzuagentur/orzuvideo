-- Add draft/ready status for Shorts created without YouTube publish
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'job_status' and e.enumlabel = 'ready'
  ) then
    alter type public.job_status add value 'ready';
  end if;
end $$;
