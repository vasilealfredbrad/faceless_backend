-- Add subtitle size selector for authenticated generation jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS subtitle_size text NOT NULL DEFAULT 'medium'
    CHECK (subtitle_size IN ('small','medium','large'));
