-- ============================================================
-- Migration 003: Tiers, Stripe columns, app settings
-- ============================================================

-- 1. Extend profiles with tier + Stripe + quota columns
alter table public.profiles
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'starter', 'growth', 'creator')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists daily_videos_used int not null default 0,
  add column if not exists daily_videos_reset_at date not null default current_date;

-- 2. App-wide settings (admin-configurable)
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings (key, value) values
  ('free_tier_enabled', 'true'),
  ('free_tier_daily_limit', '5')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

create policy "Anyone can read app_settings"
  on public.app_settings for select
  using (true);

-- 3. Update handle_new_user() to include new default columns
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, tier, daily_videos_used, daily_videos_reset_at)
  values (new.id, 'free', 0, current_date);
  return new;
end;
$$ language plpgsql security definer;
