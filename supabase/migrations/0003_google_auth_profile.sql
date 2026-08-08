-- ============================================================
-- Signup trigger: also understand Google OAuth metadata.
-- Google sends `name` / `picture`; email sign-ups send `full_name`.
-- The role for OAuth users is confirmed on /auth/callback/.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_name text;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'customer')::public.user_role;
  if v_role = 'admin' then
    v_role := 'customer'; -- admin is only ever granted manually
  end if;

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''
  );

  insert into public.profiles (id, role, full_name, email, phone, postcode)
  values (
    new.id,
    v_role,
    v_name,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'postcode', '')
  );

  if v_role = 'cleaner' then
    insert into public.cleaner_details (profile_id, avatar_url)
    values (new.id, nullif(new.raw_user_meta_data ->> 'picture', ''));
  end if;

  return new;
end;
$$;

-- Providers may switch role once during onboarding (Google sign-ups land as
-- 'customer' by default); creating their details row must then be allowed.
create or replace function public.ensure_cleaner_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'cleaner' and old.role is distinct from 'cleaner' then
    insert into public.cleaner_details (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_profile_role_change
  after update of role on public.profiles
  for each row execute procedure public.ensure_cleaner_details();
