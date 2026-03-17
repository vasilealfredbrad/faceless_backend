-- Set free tier daily quota to 15 videos/day
insert into public.app_settings (key, value)
values ('free_tier_daily_limit', '15')
on conflict (key) do update set value = excluded.value;

