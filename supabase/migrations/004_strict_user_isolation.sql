-- Remove the policy that let anyone view completed jobs.
-- Only the job owner can see their own jobs now.
drop policy if exists "Anyone can view completed jobs" on public.jobs;
