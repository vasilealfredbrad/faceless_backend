-- ============================================================
-- Migration 005: Source videos and clips tracking
-- ============================================================

-- 1. Source videos — each YouTube download
create table if not exists public.source_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_url text not null,
  youtube_id text,
  title text,
  category text not null,
  source_path text,
  duration_seconds real,
  status text not null default 'downloading'
    check (status in ('downloading', 'cutting', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index idx_source_videos_category on public.source_videos(category);
create index idx_source_videos_status on public.source_videos(status);
create index idx_source_videos_youtube_id on public.source_videos(youtube_id);

alter table public.source_videos enable row level security;

create policy "Admins can read source_videos"
  on public.source_videos for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

create policy "Service role full access source_videos"
  on public.source_videos for all
  using (true)
  with check (true);

-- 2. Source clips — each clip cut from a source video
create table if not exists public.source_clips (
  id uuid primary key default gen_random_uuid(),
  source_video_id uuid not null references public.source_videos(id) on delete cascade,
  clip_path text not null,
  clip_duration smallint not null check (clip_duration in (30, 60)),
  start_time real,
  filename text,
  times_used int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_source_clips_source on public.source_clips(source_video_id);
create index idx_source_clips_duration on public.source_clips(clip_duration);

alter table public.source_clips enable row level security;

create policy "Admins can read source_clips"
  on public.source_clips for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

create policy "Service role full access source_clips"
  on public.source_clips for all
  using (true)
  with check (true);
