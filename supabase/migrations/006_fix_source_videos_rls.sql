-- Remove overly permissive policies that allowed anonymous access.
-- Service role bypasses RLS, so backend inserts work without these.
-- Only admins (via "Admins can read" policy) should access source_videos/source_clips.
drop policy if exists "Service role full access source_videos" on public.source_videos;
drop policy if exists "Service role full access source_clips" on public.source_clips;
