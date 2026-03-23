-- Add spoken-word effect mode selector to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS word_effect_mode text NOT NULL DEFAULT 'combo'
    CHECK (word_effect_mode IN ('keep_color_only','scale_pop','glow','box','combo'));
