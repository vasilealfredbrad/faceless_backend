-- Add optional subtitle color overrides for authenticated jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS subtitle_color_text text,
  ADD COLUMN IF NOT EXISTS subtitle_color_active text,
  ADD COLUMN IF NOT EXISTS subtitle_color_outline text,
  ADD COLUMN IF NOT EXISTS subtitle_color_box text;
