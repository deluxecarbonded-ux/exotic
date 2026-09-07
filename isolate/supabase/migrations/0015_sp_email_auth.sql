-- 0015: SINGLE-PLAYER EMAIL AUTH (same flow as multiplayer).
-- • Email sign-ups now create BOTH an sp.profiles row AND an mp.profiles
--   row for the same identity — the same email/username/password works
--   in single player and multiplayer (and vice versa).
-- • Anonymous (device-vault) users keep their sp.profiles untouched.
-- • Backfill: existing email identities that lack an sp.profiles row
--   get one, so MP veterans can sign into single player immediately.
-- • ensure_profile() RPCs self-heal any missing row on either side.

-- ── auth trigger: one identity → both profiles ──────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    -- legacy device vault (anonymous) → single player only
    insert into sp.profiles (id) values (new.id) on conflict (id) do nothing;
  else
    -- email identity → duel account AND solo vault (same username)
    insert into mp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Agent'))
    on conflict (id) do nothing;
    insert into sp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Player'))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- ── backfill: email users without a solo vault get one ──────────
insert into sp.profiles (id, username)
select u.id,
       coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'username', '')), ''),
                (select m.username from mp.profiles m where m.id = u.id),
                'Player')
from auth.users u
where u.email is not null
  and not exists (select 1 from sp.profiles p where p.id = u.id);

-- ── self-heal: create the missing half of an identity on demand ──
create or replace function sp.ensure_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from sp.profiles where id = uid) then
    return jsonb_build_object('ok', true);
  end if;
  uname := coalesce(
    nullif(trim(coalesce((select raw_user_meta_data->>'username' from auth.users where id = uid), '')), ''),
    (select username from mp.profiles where id = uid),
    'Player');
  insert into sp.profiles (id, username) values (uid, left(uname, 16));
  return jsonb_build_object('ok', true, 'created', true);
end $$;

create or replace function mp.ensure_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from mp.profiles where id = uid) then
    return jsonb_build_object('ok', true);
  end if;
  uname := coalesce(
    nullif(trim(coalesce((select raw_user_meta_data->>'username' from auth.users where id = uid), '')), ''),
    (select username from sp.profiles where id = uid),
    'Agent');
  insert into mp.profiles (id, username) values (uid, left(uname, 16));
  return jsonb_build_object('ok', true, 'created', true);
end $$;
