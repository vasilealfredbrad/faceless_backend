-- Add subtitle_preset column to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS subtitle_preset text NOT NULL DEFAULT 'classic'
    CHECK (subtitle_preset IN ('classic','bold-pop','clean','neon','typewriter','impact'));
