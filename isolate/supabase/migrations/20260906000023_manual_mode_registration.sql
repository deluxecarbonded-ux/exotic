-- 0023 — Manual per-mode registration. No profile is ever created
--   automatically on entering a mode: the second mode's profile is
--   created ONLY when the player explicitly submits the "Register for
--   {mode}" form (same email account, same or different username).
--   ensure_profile() is dropped so nothing can auto-create rows.

drop function if exists sp.ensure_profile();
drop function if exists mp.ensure_profile();

create or replace function sp.register_profile(p_username text) returns jsonb
language plpgsql security definer set search_path = sp, public as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from sp.profiles where id = uid) then
    return jsonb_build_object('ok', true, 'exists', true);
  end if;
  uname := left(btrim(coalesce(p_username, '')), 16);
  if length(uname) < 2 then return jsonb_build_object('ok', false, 'error', 'username'); end if;
  insert into sp.profiles (id, username) values (uid, uname);
  return jsonb_build_object('ok', true, 'created', true);
end $$;

create or replace function mp.register_profile(p_username text) returns jsonb
language plpgsql security definer set search_path = mp, public as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from mp.profiles where id = uid) then
    return jsonb_build_object('ok', true, 'exists', true);
  end if;
  uname := left(btrim(coalesce(p_username, '')), 16);
  if length(uname) < 2 then return jsonb_build_object('ok', false, 'error', 'username'); end if;
  insert into mp.profiles (id, username) values (uid, uname);
  return jsonb_build_object('ok', true, 'created', true);
end $$;

revoke all on function sp.register_profile(text) from public, anon;
revoke all on function mp.register_profile(text) from public, anon;
grant execute on function sp.register_profile(text) to authenticated;
grant execute on function mp.register_profile(text) to authenticated;
