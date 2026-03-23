-- Fix check_user_video_quota() to skip quota check for guest jobs
CREATE OR REPLACE FUNCTION public.check_user_video_quota()
RETURNS trigger AS $$
declare
  user_tier text;
  used_today int;
  reset_date date;
  free_enabled text;
  free_limit text;
begin
  -- Skip quota check for guest jobs (no user_id)
  IF new.is_guest = true OR new.user_id IS NULL THEN
    RETURN new;
  END IF;

  -- Fetch user profile data
  select tier, daily_videos_used, daily_videos_reset_at
  into user_tier, used_today, reset_date
  from public.profiles
  where id = new.user_id;

  if not found then
    raise exception 'User profile not found';
  end if;

  -- Reset counter if a new day has started
  if reset_date < current_date then
    used_today := 0;
    reset_date := current_date;
  end if;

  -- Check quota if user is on free tier
  if user_tier = 'free' then
    select value into free_enabled from public.app_settings where key = 'free_tier_enabled';
    if free_enabled = 'false' then
      raise exception 'Free tier is currently disabled';
    end if;

    select value into free_limit from public.app_settings where key = 'free_tier_daily_limit';
    
    if used_today >= coalesce(free_limit::int, 5) then
      raise exception 'Daily free video limit reached';
    end if;
  end if;

  -- Update the profile with new usage
  update public.profiles
  set 
    daily_videos_used = used_today + 1,
    daily_videos_reset_at = reset_date
  where id = new.user_id;

  return new;
end;
$$ language plpgsql security definer;
