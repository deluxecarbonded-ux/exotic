-- 0022 — Solo and Duel registrations are FULLY SEPARATE.
--   handle_new_user() now creates ONLY the profile for the mode the
--   player signed up for (auth metadata: {"mode": "sp" | "mp"}).
--     * anonymous device vaults → sp only (legacy behavior)
--     * mode "mp" (Duel signup)  → mp.profiles only
--     * anything else (Solo signup / dashboard users) → sp.profiles only
--   The other mode registers itself on first entry via the existing
--   sp.ensure_profile() / mp.ensure_profile() RPCs (username inherited
--   from auth metadata or the other mode's profile) — already granted
--   to authenticated, already wired into the profile hooks.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m text;
begin
  m := lower(coalesce(new.raw_user_meta_data->>'mode', ''));
  if new.email is null then
    -- legacy device vault (anonymous) → single player only
    insert into sp.profiles (id) values (new.id) on conflict (id) do nothing;
  elsif m = 'mp' then
    -- Duel signup → Duel profile ONLY (Solo self-registers on entry)
    insert into mp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Agent'))
    on conflict (id) do nothing;
  else
    -- Solo signup (or manual/dashboard creation) → Solo profile ONLY
    insert into sp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Player'))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
