-- Guest homepage: allow anon + authenticated clients to insert only guest rows (no user_id)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Allow guest job insert" ON public.jobs;

CREATE POLICY "Allow guest job insert"
  ON public.jobs FOR INSERT
  WITH CHECK (
    is_guest = true
    AND user_id IS NULL
  );
