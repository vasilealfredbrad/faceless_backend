-- Jobs table for video generation pipeline
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending',
      'generating_script',
      'generating_voice',
      'fitting_audio',
      'building_subtitles',
      'assembling_video',
      'uploading',
      'completed',
      'failed'
    )),
  topic text not null,
  duration smallint not null check (duration in (30, 60)),
  voice text not null,
  background text not null,
  script text,
  audio_url text,
  subtitles_url text,
  video_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_jobs_updated
  before update on public.jobs
  for each row
  execute function public.handle_updated_at();

-- RLS
alter table public.jobs enable row level security;

create policy "Users can insert their own jobs"
  on public.jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own jobs"
  on public.jobs for select
  using (auth.uid() = user_id);

-- Allow service role full access (worker uses service role key, bypasses RLS automatically)

-- Enable realtime
alter publication supabase_realtime add table public.jobs;

-- Index for worker queries
create index idx_jobs_status on public.jobs(status);
create index idx_jobs_user_id on public.jobs(user_id);
