-- 0019 · mandatory email confirmation, per mode.
-- Signing up sends a separate Solo / Duel confirmation email from
-- Exotic@DevilExotic.com; the account must confirm before it can play
-- (start a solo level, create or join a duel room).

alter table sp.profiles add column if not exists email_verified boolean not null default false;
alter table mp.profiles add column if not exists email_verified boolean not null default false;

-- everyone who already played is grandfathered in
update sp.profiles set email_verified = true;
update mp.profiles set email_verified = true;

-- one-time confirmation tokens (hash-stored; server access only —
-- RLS is on with no policies, so anon/authenticated clients see nothing)
create table if not exists public.email_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('sp', 'mp')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.email_tokens enable row level security;

-- ── gates ──

create or replace function sp.start_game(p_difficulty text, p_double boolean default false, p_level integer default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare gid uuid; tl int; lvl int; n int; dbl boolean := coalesce(p_double, false); base_tl int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not coalesce((select email_verified from sp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
  if p_difficulty = 'easy'       then base_tl := 240;
  elsif p_difficulty = 'medium'  then base_tl := 180;
  elsif p_difficulty = 'hard'    then base_tl := 150;
  else raise exception 'Exotic: unknown difficulty'; end if;

  lvl := least(30, greatest(1, coalesce(p_level, 1)));
  if (coalesce((select (levels->>p_difficulty)::int from sp.profiles where id = auth.uid()), 1)) < lvl then
    raise exception 'Exotic: level locked';
  end if;

  -- one active game per player: retire anything stale first
  update sp.games set status = 'abandoned', finished_at = now()
  where player_id = auth.uid() and status = 'active';

  tl := greatest(60, base_tl - (lvl - 1) * 5);

  if dbl then
    update sp.inventory set qty = qty - 1
    where player_id = auth.uid() and item_id = 'double' and qty > 0;
    get diagnostics n = row_count;
    if n = 0 then dbl := false; end if;
  end if;

  insert into sp.games (player_id, difficulty, level, time_limit, double_sparks)
  values (auth.uid(), p_difficulty, lvl, tl, dbl)
  returning id into gid;

  return jsonb_build_object('id', gid, 'time_limit', tl, 'level', lvl);
end $function$
;

create or replace function mp.create_room(p_difficulty text default 'easy'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare rid uuid; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not exists(select 1 from mp.profiles where id = auth.uid()) then
    raise exception 'Exotic: create a duel account first'; end if;
  if not coalesce((select email_verified from mp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
  if exists(
    select 1 from mp.rooms r join mp.room_players rp on rp.room_id = r.id
    where rp.player_id = auth.uid() and r.status in ('waiting','active')
  ) then raise exception 'Exotic: you are already in a room'; end if;
  if p_difficulty not in ('easy','medium','hard') then
    raise exception 'Exotic: unknown difficulty'; end if;

  loop
    c := mp.gen_room_code();
    exit when not exists(select 1 from mp.rooms where code = c);
    tries := tries + 1;
    if tries > 25 then raise exception 'Exotic: please try again'; end if;
  end loop;

  insert into mp.rooms (code, host_id, difficulty)
  values (c, auth.uid(), p_difficulty) returning id into rid;
  insert into mp.room_players (room_id, player_id) values (rid, auth.uid());
  return jsonb_build_object('id', rid, 'code', c);
end $function$
;

create or replace function mp.join_room(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not coalesce((select email_verified from mp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
  select * into r from mp.rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'waiting' then raise exception 'Exotic: that duel already started'; end if;
  if exists(select 1 from mp.room_players
            where room_id = r.id and player_id = auth.uid()) then
    return jsonb_build_object('id', r.id, 'code', r.code);
  end if;
  if (select count(*) from mp.room_players where room_id = r.id) >= 2 then
    raise exception 'Exotic: room is full';
  end if;

  insert into mp.room_players (room_id, player_id) values (r.id, auth.uid());
  return jsonb_build_object('id', r.id, 'code', r.code);
end $function$
;
