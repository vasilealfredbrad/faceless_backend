-- Profiles table with admin flag
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Allow anyone to view completed jobs (shareable preview links)
create policy "Anyone can view completed jobs"
  on public.jobs for select
  using (status = 'completed');

-- Input validation constraints
alter table public.jobs add constraint topic_length check (char_length(topic) <= 500);
alter table public.jobs add constraint voice_length check (char_length(voice) <= 50);
alter table public.jobs add constraint background_length check (char_length(background) <= 100);
