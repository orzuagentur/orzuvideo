-- Allow users to update/delete their own video_jobs (Creativity library, drafts)
drop policy if exists "Users update own jobs" on public.video_jobs;
create policy "Users update own jobs"
  on public.video_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own jobs" on public.video_jobs;
create policy "Users delete own jobs"
  on public.video_jobs for delete
  using (auth.uid() = user_id);
