-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0003 — GAME LOGIC (RPCs) + AUTH TRIGGER
--  All economy/match mutations are SECURITY DEFINER functions:
--  validated server-side, atomic, cheat-proof.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────── shared helpers ─────────────────────────

-- random 4-digit code, unique digits
create or replace function public.gen_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  pool int[] := array[0,1,2,3,4,5,6,7,8,9];
  code text := '';
  idx int; v int;
begin
  for i in 1..4 loop
    idx := 1 + floor(random() * array_length(pool, 1))::int;
    v := pool[idx];
    code := code || v::text;
    pool := array_remove(pool, v);
  end loop;
  return code;
end $$;

-- mastermind feedback: exact = right digit right place, partial = right digit wrong place
create or replace function public.code_feedback(secret text, guess text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  exact int := 0; shared int := 0; i int;
begin
  for i in 1..4 loop
    if substr(secret, i, 1) = substr(guess, i, 1) then exact := exact + 1; end if;
    if position(substr(guess, i, 1) in secret) > 0 then shared := shared + 1; end if;
  end loop;
  return jsonb_build_object('exact', exact, 'partial', shared - exact);
end $$;

-- a truthful clue derived from a secret code
create or replace function public.make_clue(code text, forced_kind text default null) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  kinds text[] := array['position','sum','parity','contains','min','max','greater'];
  kind text; pos int; s int := 0; ev int := 0; od int := 0;
  mn int := 9; mx int := 0; i int; c int; d int;
begin
  for i in 1..4 loop
    c := substr(code, i, 1)::int;
    s := s + c;
    if c % 2 = 0 then ev := ev + 1; else od := od + 1; end if;
    if c < mn then mn := c; end if;
    if c > mx then mx := c; end if;
  end loop;

  kind := coalesce(nullif(trim(forced_kind), ''),
                   kinds[1 + floor(random() * array_length(kinds, 1))::int]);
  if kind = 'greater' and substr(code, 1, 1)::int = 0 then kind := 'sum'; end if;

  case kind
    when 'position' then
      pos := 1 + floor(random() * 4)::int;
      return jsonb_build_object('kind', kind, 'payload',
        jsonb_build_object('pos', pos, 'd', substr(code, pos, 1)::int));
    when 'sum' then
      return jsonb_build_object('kind', kind, 'payload', jsonb_build_object('v', s));
    when 'parity' then
      return jsonb_build_object('kind', kind, 'payload',
        jsonb_build_object('even', ev, 'odd', od));
    when 'contains' then
      pos := 1 + floor(random() * 4)::int;
      return jsonb_build_object('kind', kind, 'payload',
        jsonb_build_object('d', substr(code, pos, 1)::int));
    when 'min' then
      return jsonb_build_object('kind', kind, 'payload', jsonb_build_object('v', mn));
    when 'max' then
      return jsonb_build_object('kind', kind, 'payload', jsonb_build_object('v', mx));
    else
      c := substr(code, 1, 1)::int;
      d := floor(random() * greatest(c, 1))::int;
      return jsonb_build_object('kind', 'greater', 'payload', jsonb_build_object('v', d));
  end case;
end $$;

-- ───────────────────────── auth bootstrap ─────────────────────────
-- Anonymous identity (no email) → single-player vault.
-- Email identity → multiplayer duel account (username from metadata).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    insert into sp.profiles (id) values (new.id) on conflict (id) do nothing;
  else
    insert into mp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Agent'))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists exotic_on_auth_user_created on auth.users;
create trigger exotic_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
--  SINGLE PLAYER RPCs
-- ═══════════════════════════════════════════════════════════════

create or replace function sp.award(p_id text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare r int;
begin
  insert into sp.player_achievements (player_id, achievement_id)
  values (auth.uid(), p_id)
  on conflict do nothing;
  get diagnostics r = row_count;
  if r > 0 then
    update sp.profiles set sparks = sparks +
      coalesce((select reward from sp.achievements_catalog where id = p_id), 0)
    where id = auth.uid();
    return array[p_id];
  end if;
  return '{}';
end $$;

create or replace function sp.start_game(p_difficulty text, p_double boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gid uuid; att int; cl int; tl int; dbl boolean := coalesce(p_double, false);
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_difficulty = 'easy' then att := 6; cl := 8; tl := 240;
  elsif p_difficulty = 'medium' then att := 5; cl := 6; tl := 180;
  elsif p_difficulty = 'hard' then att := 3; cl := 4; tl := 150;
  else raise exception 'Exotic: unknown difficulty'; end if;

  if dbl then
    update sp.inventory set qty = qty - 1
    where player_id = auth.uid() and item_id = 'double' and qty > 0;
    get diagnostics tl = row_count;
    if tl = 0 then dbl := false; end if;
    tl := case p_difficulty when 'easy' then 240 when 'medium' then 180 else 150 end;
  end if;

  insert into sp.games (player_id, difficulty, attempts_max, attempts_left, clues_max, time_limit, double_sparks)
  values (auth.uid(), p_difficulty, att, att, cl, tl, dbl)
  returning id into gid;

  insert into sp.secrets (game_id, code) values (gid, public.gen_code());

  return jsonb_build_object('id', gid, 'time_limit', tl,
                            'attempts_max', att, 'clues_max', cl);
end $$;

create or replace function sp.earn_clue(p_game uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g sp.games; secret text; clue jsonb;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then raise exception 'Exotic: game over'; end if;
  if g.clues_used >= g.clues_max then raise exception 'Exotic: no clues left'; end if;

  select code into secret from sp.secrets where game_id = p_game;
  clue := public.make_clue(secret, p_kind);
  insert into sp.clues (game_id, kind, payload)
  values (p_game, clue->>'kind', clue->'payload');
  update sp.games set clues_used = clues_used + 1 where id = p_game;
  return clue;
end $$;

create or replace function sp.submit_guess(p_game uuid, p_guess text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g sp.games; secret text; fb jsonb; exact int; partial int;
  base int; bonus int; reward int; dur int;
  new_xp int; lvl int; leveled boolean := false; new_achs text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_guess !~ '^[0-9]{4}$' then raise exception 'Exotic: a guess needs 4 digits'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then raise exception 'Exotic: game over'; end if;
  if g.attempts_left <= 0 then raise exception 'Exotic: no attempts left'; end if;

  select code into secret from sp.secrets where game_id = p_game;
  fb := public.code_feedback(secret, p_guess);
  exact := (fb->>'exact')::int;
  partial := (fb->>'partial')::int;
  insert into sp.guesses (game_id, guess, exact, partial)
  values (p_game, p_guess, exact, partial);

  if exact = 4 then
    dur := greatest(0, extract(epoch from (now() - g.started_at))::int);
    base := case g.difficulty when 'easy' then 40 when 'medium' then 70 else 120 end;
    bonus := least(60, greatest(0, (g.time_limit - dur) / 2));
    reward := base + bonus;
    if g.double_sparks then reward := reward * 2; end if;

    update sp.games
       set status = 'won', attempts_left = g.attempts_left - 1,
           finished_at = now(), duration = dur, reward = reward, xp_earned = 30
     where id = p_game;

    update sp.profiles set
      sparks = sparks + reward, xp = xp + 30,
      wins = wins + 1, games = games + 1, streak = streak + 1,
      best_time = case when best_time is null or dur < best_time then dur else best_time end
    where id = auth.uid();

    insert into sp.transactions (player_id, delta, reason)
    values (auth.uid(), reward, 'win:' || p_game);

    select level, xp into lvl, new_xp from sp.profiles where id = auth.uid();
    while new_xp >= lvl * 100 loop lvl := lvl + 1; leveled := true; end loop;
    if leveled then update sp.profiles set level = lvl where id = auth.uid(); end if;

    new_achs := new_achs || sp.award('first_win');
    if (select streak from sp.profiles where id = auth.uid()) >= 3 then
      new_achs := new_achs || sp.award('streak_3'); end if;
    if (select streak from sp.profiles where id = auth.uid()) >= 5 then
      new_achs := new_achs || sp.award('streak_5'); end if;
    if dur <= 60 then new_achs := new_achs || sp.award('speed_60'); end if;
    if g.clues_used = 0 then new_achs := new_achs || sp.award('ghost'); end if;
    if lvl >= 5 then new_achs := new_achs || sp.award('level_5'); end if;
    if (select sparks from sp.profiles where id = auth.uid()) >= 500 then
      new_achs := new_achs || sp.award('rich_500'); end if;

    return jsonb_build_object('win', true, 'lost', false, 'exact', exact, 'partial', partial,
      'attempts_left', g.attempts_left - 1, 'reward', reward, 'xp_earned', 30,
      'level', lvl, 'level_up', leveled, 'new_achievements', new_achs,
      'secret_code', secret);
  end if;

  update sp.games set attempts_left = attempts_left - 1 where id = p_game;

  if g.attempts_left - 1 <= 0 then
    update sp.games
       set status = 'lost', finished_at = now(),
           duration = greatest(0, extract(epoch from (now() - g.started_at))::int)
     where id = p_game;
    update sp.profiles set games = games + 1, streak = 0, xp = xp + 5
    where id = auth.uid();
    return jsonb_build_object('win', false, 'lost', true, 'exact', exact, 'partial', partial,
      'attempts_left', 0, 'secret_code', secret);
  end if;

  return jsonb_build_object('win', false, 'lost', false, 'exact', exact, 'partial', partial,
    'attempts_left', g.attempts_left - 1);
end $$;

create or replace function sp.time_out(p_game uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g sp.games; secret text;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then return jsonb_build_object('lost', false); end if;

  select code into secret from sp.secrets where game_id = p_game;
  update sp.games set status = 'lost', finished_at = now(),
    duration = greatest(0, extract(epoch from (now() - g.started_at))::int)
  where id = p_game;
  update sp.profiles set games = games + 1, streak = 0, xp = xp + 5
  where id = auth.uid();
  return jsonb_build_object('lost', true, 'timeout', true, 'secret_code', secret);
end $$;

create or replace function sp.abandon_game(p_game uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update sp.games set status = 'abandoned', finished_at = now()
  where id = p_game and player_id = auth.uid() and status = 'active';
  return jsonb_build_object('ok', true);
end $$;

create or replace function sp.use_item(p_item text, p_game uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv sp.inventory; g sp.games; secret text; clue jsonb;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into inv from sp.inventory
  where player_id = auth.uid() and item_id = p_item for update;
  if not found or inv.qty <= 0 then raise exception 'Exotic: item not owned'; end if;

  if p_item = 'extra-guess' then
    if p_game is null then raise exception 'Exotic: no active game'; end if;
    select * into g from sp.games where id = p_game for update;
    if not found or g.player_id <> auth.uid() or g.status <> 'active' then
      raise exception 'Exotic: game not found'; end if;
    update sp.games set attempts_left = attempts_left + 1 where id = p_game;
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);

  elsif p_item = 'time-freeze' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);

  elsif p_item = 'reveal' then
    if p_game is null then raise exception 'Exotic: no active game'; end if;
    select * into g from sp.games where id = p_game for update;
    if not found or g.player_id <> auth.uid() or g.status <> 'active' then
      raise exception 'Exotic: game not found'; end if;
    select code into secret from sp.secrets where game_id = p_game;
    clue := public.make_clue(secret, 'position');
    insert into sp.clues (game_id, kind, payload)
    values (p_game, 'position', clue->'payload');
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true, 'clue', clue);

  elsif p_item = 'oracle' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Exotic: item is not usable';
end $$;

create or replace function sp.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it sp.shop_items; p sp.profiles;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into it from sp.shop_items where id = p_item and available;
  if not found then raise exception 'Exotic: item unavailable'; end if;
  select * into p from sp.profiles where id = auth.uid() for update;
  if p.sparks < it.price then raise exception 'Exotic: not enough Sparks'; end if;
  if it.category = 'cosmetics'
     and exists(select 1 from sp.inventory where player_id = auth.uid() and item_id = p_item) then
    raise exception 'Exotic: already owned';
  end if;

  update sp.profiles set sparks = sparks - it.price where id = auth.uid();
  insert into sp.inventory (player_id, item_id, qty) values (auth.uid(), p_item, 1)
  on conflict (player_id, item_id) do update set qty = sp.inventory.qty + 1;
  insert into sp.transactions (player_id, delta, reason)
  values (auth.uid(), -it.price, 'buy:' || p_item);

  perform sp.award('first_buy');
  return jsonb_build_object('ok', true);
end $$;

create or replace function sp.equip_item(p_item text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it sp.shop_items; inv_row sp.inventory;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into it from sp.shop_items where id = p_item and category = 'cosmetics';
  if not found then raise exception 'Exotic: not equippable'; end if;
  select * into inv_row from sp.inventory
  where player_id = auth.uid() and item_id = p_item and qty > 0;
  if not found then raise exception 'Exotic: not owned'; end if;

  if p_on then
    update sp.inventory set equipped = false
    where player_id = auth.uid() and equipped
      and item_id in (select id from sp.shop_items
                      where category = 'cosmetics'
                        and effect->>'slot' = it.effect->>'slot');
    update sp.inventory set equipped = true where id = inv_row.id;
    if it.effect->>'slot' = 'avatar' then
      update sp.profiles set avatar = it.icon where id = auth.uid();
    end if;
  else
    update sp.inventory set equipped = false where id = inv_row.id;
    if it.effect->>'slot' = 'avatar' then
      update sp.profiles set avatar = 'sparkles' where id = auth.uid();
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function sp.claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p sp.profiles; amount int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into p from sp.profiles where id = auth.uid() for update;
  if p.last_daily = current_date then raise exception 'Exotic: already claimed today'; end if;
  amount := least(100, 25 + p.level * 5);
  update sp.profiles set sparks = sparks + amount, last_daily = current_date
  where id = auth.uid();
  insert into sp.transactions (player_id, delta, reason)
  values (auth.uid(), amount, 'daily');
  return jsonb_build_object('ok', true, 'amount', amount);
end $$;

create or replace function sp.rename(p_username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if char_length(trim(p_username)) < 2 or char_length(trim(p_username)) > 16 then
    raise exception 'Exotic: name must be 2–16 characters'; end if;
  update sp.profiles set username = trim(p_username) where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function sp.set_avatar(p_icon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update sp.profiles set avatar = p_icon where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function sp.leaderboard()
returns table (id uuid, username text, avatar text, level int,
               sparks bigint, wins int, streak int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar, p.level, p.sparks, p.wins, p.streak
  from sp.profiles p
  order by p.wins desc, p.sparks desc
  limit 20
$$;

-- ═══════════════════════════════════════════════════════════════
--  MULTIPLAYER RPCs
-- ═══════════════════════════════════════════════════════════════

create or replace function mp.award(p_id text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare r int;
begin
  insert into mp.player_achievements (player_id, achievement_id)
  values (auth.uid(), p_id)
  on conflict do nothing;
  get diagnostics r = row_count;
  if r > 0 then
    update mp.profiles set novas = novas +
      coalesce((select reward from mp.achievements_catalog where id = p_id), 0)
    where id = auth.uid();
    return array[p_id];
  end if;
  return '{}';
end $$;

create or replace function mp.sync_level(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl int; x int;
begin
  select level, xp into lvl, x from mp.profiles where id = uid;
  while x >= lvl * 100 loop lvl := lvl + 1; end loop;
  update mp.profiles set level = lvl where id = uid;
end $$;

create or replace function mp.gen_room_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
begin
  for i in 1..5 loop
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out;
end $$;

create or replace function mp.create_room(p_difficulty text default 'easy') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rid uuid; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not exists(select 1 from mp.profiles where id = auth.uid()) then
    raise exception 'Exotic: create a duel account first'; end if;
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
end $$;

create or replace function mp.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'waiting' then raise exception 'Exotic: that duel already started'; end if;
  if exists(select 1 from mp.room_players
            where room_id = r.id and player_id = auth.uid()) then
    return jsonb_build_object('id', r.id, 'code', r.code);
  end if;
  if (select count(*) from mp.room_players where room_id = r.id) >= 2 then
    raise exception 'Exotic: room is full'; end if;

  insert into mp.room_players (room_id, player_id) values (r.id, auth.uid());
  return jsonb_build_object('id', r.id, 'code', r.code);
end $$;

create or replace function mp.leave_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if exists(select 1 from mp.rooms where id = p_room and host_id = auth.uid()) then
    delete from mp.rooms where id = p_room;
  else
    delete from mp.room_players where room_id = p_room and player_id = auth.uid();
    if not exists(select 1 from mp.room_players where room_id = p_room) then
      delete from mp.rooms where id = p_room;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.set_ready(p_room uuid, p_ready boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update mp.room_players set ready = p_ready
  where room_id = p_room and player_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.start_match(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host can start'; end if;
  if r.status <> 'waiting' then raise exception 'Exotic: already running'; end if;
  if (select count(*) from mp.room_players where room_id = p_room) <> 2 then
    raise exception 'Exotic: waiting for a second player'; end if;
  if exists(select 1 from mp.room_players
            where room_id = p_room and ready = false and player_id <> auth.uid()) then
    raise exception 'Exotic: opponent is not ready'; end if;

  insert into mp.secrets (room_id, code) values (p_room, public.gen_code())
  on conflict (room_id) do update set code = excluded.code;

  update mp.rooms set status = 'active', round_no = 0, winner_id = null
  where id = p_room;
  update mp.room_players set score = 0, ready = false, guesses_left = 3
  where room_id = p_room;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.create_round(
  p_room uuid, p_category text, p_prompt text, p_options jsonb, p_answer int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms; clue jsonb; secret text; rid bigint;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'active' then raise exception 'Exotic: room not active'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host creates rounds'; end if;
  if r.round_no >= r.max_rounds then raise exception 'Exotic: max rounds reached'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then
    raise exception 'Exotic: a round needs 4 options'; end if;
  if p_answer < 0 or p_answer > 3 then raise exception 'Exotic: bad answer index'; end if;
  if char_length(p_prompt) < 3 or char_length(p_prompt) > 600 then
    raise exception 'Exotic: bad question'; end if;

  select code into secret from mp.secrets where room_id = p_room;
  clue := public.make_clue(secret);

  insert into mp.rounds (room_id, match_no, round_no, category, prompt, options, clue)
  values (p_room, r.match_no, r.round_no + 1, p_category, p_prompt, p_options, clue)
  returning id into rid;

  insert into mp.answers (round_id, answer_index) values (rid, p_answer);
  update mp.rooms set round_no = r.round_no + 1 where id = p_room;
  return jsonb_build_object('id', rid, 'round_no', r.round_no + 1, 'clue', clue);
end $$;

create or replace function mp.answer_round(p_room uuid, p_round bigint, p_option int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r mp.rooms; rd mp.rounds; ans int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'active' then raise exception 'Exotic: room not active'; end if;
  if not mp.is_member(p_room) then raise exception 'Exotic: not a member'; end if;

  select * into rd from mp.rounds where id = p_round and room_id = p_room for update;
  if not found then raise exception 'Exotic: round not found'; end if;
  if rd.answered_by is not null then
    return jsonb_build_object('correct', false, 'late', true); end if;
  if auth.uid() = any(rd.wrong_by) then
    return jsonb_build_object('correct', false, 'locked', true); end if;

  select answer_index into ans from mp.answers where round_id = p_round;

  if p_option = ans then
    update mp.rounds set answered_by = auth.uid() where id = p_round;
    update mp.room_players set score = score + 1
    where room_id = p_room and player_id = auth.uid();
    return jsonb_build_object('correct', true);
  end if;

  update mp.rounds set wrong_by = array_append(wrong_by, auth.uid()) where id = p_round;
  return jsonb_build_object('correct', false);
end $$;

create or replace function mp.finish_draw(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update mp.rooms set status = 'finished', winner_id = null
  where id = p_room and status = 'active';
  update mp.profiles set novas = novas + 10, games = games + 1, xp = xp + 10
  where id in (select player_id from mp.room_players where room_id = p_room);
  insert into mp.transactions (player_id, delta, reason)
  select player_id, 10, 'duel-draw:' || p_room
  from mp.room_players where room_id = p_room;
end $$;

create or replace function mp.submit_guess(p_room uuid, p_guess text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r mp.rooms; me mp.room_players; secret text; fb jsonb;
  exact int; partial int; winner_reward int; new_achs text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_guess !~ '^[0-9]{4}$' then raise exception 'Exotic: a guess needs 4 digits'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'active' then raise exception 'Exotic: match is over'; end if;
  select * into me from mp.room_players
  where room_id = p_room and player_id = auth.uid() for update;
  if not found then raise exception 'Exotic: not a member'; end if;
  if me.guesses_left <= 0 then raise exception 'Exotic: no guesses left'; end if;

  select code into secret from mp.secrets where room_id = p_room;
  fb := public.code_feedback(secret, p_guess);
  exact := (fb->>'exact')::int;
  partial := (fb->>'partial')::int;

  insert into mp.guesses (room_id, match_no, player_id, guess, exact, partial)
  values (p_room, r.match_no, auth.uid(), p_guess, exact, partial);

  if exact = 4 then
    winner_reward := 60 + me.score * 10;
    update mp.rooms set status = 'finished', winner_id = auth.uid() where id = p_room;

    update mp.profiles set
      novas = novas + winner_reward, wins = wins + 1, games = games + 1,
      streak = streak + 1, best_streak = greatest(best_streak, streak + 1),
      xp = xp + 40, rank_points = rank_points + 25
    where id = auth.uid();

    update mp.profiles set
      novas = novas + 15, losses = losses + 1, games = games + 1,
      streak = 0, xp = xp + 10, rank_points = greatest(100, rank_points - 20)
    where id in (select player_id from mp.room_players
                 where room_id = p_room and player_id <> auth.uid());

    insert into mp.transactions (player_id, delta, reason)
    values (auth.uid(), winner_reward, 'duel-win:' || p_room);

    perform mp.sync_level(auth.uid());
    new_achs := new_achs || mp.award('first_win');
    if (select streak from mp.profiles where id = auth.uid()) >= 3 then
      new_achs := new_achs || mp.award('streak_3'); end if;
    if (select streak from mp.profiles where id = auth.uid()) >= 5 then
      new_achs := new_achs || mp.award('streak_5'); end if;
    if (select wins from mp.profiles where id = auth.uid()) >= 10 then
      new_achs := new_achs || mp.award('winner_10'); end if;
    if (select rank_points from mp.profiles where id = auth.uid()) >= 1100 then
      new_achs := new_achs || mp.award('rank_1100'); end if;
    if (select level from mp.profiles where id = auth.uid()) >= 5 then
      new_achs := new_achs || mp.award('level_5'); end if;

    return jsonb_build_object('win', true, 'lost', false, 'exact', exact, 'partial', partial,
      'reward', winner_reward, 'rank_delta', 25, 'new_achievements', new_achs,
      'secret_code', secret);
  end if;

  update mp.room_players set guesses_left = guesses_left - 1
  where room_id = p_room and player_id = auth.uid();

  if not exists(select 1 from mp.room_players
                where room_id = p_room and guesses_left > 0) then
    perform mp.finish_draw(p_room);
    return jsonb_build_object('win', false, 'lost', true, 'draw', true,
      'exact', exact, 'partial', partial, 'guesses_left', 0, 'secret_code', secret);
  end if;

  return jsonb_build_object('win', false, 'lost', false, 'exact', exact, 'partial', partial,
    'guesses_left', me.guesses_left - 1);
end $$;

create or replace function mp.end_match(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host'; end if;
  if r.status <> 'active' then return jsonb_build_object('ok', true); end if;
  perform mp.finish_draw(p_room);
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.rematch(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host can rematch'; end if;
  if r.status <> 'finished' then raise exception 'Exotic: match still running'; end if;

  insert into mp.secrets (room_id, code) values (p_room, public.gen_code())
  on conflict (room_id) do update set code = excluded.code;

  update mp.rooms set status = 'active', match_no = match_no + 1,
    round_no = 0, winner_id = null
  where id = p_room;
  update mp.room_players set score = 0, guesses_left = 3, ready = true
  where room_id = p_room;
  return jsonb_build_object('ok', true, 'match_no', r.match_no + 1);
end $$;

create or replace function mp.send_chat(p_room uuid, p_kind text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not mp.is_member(p_room) then raise exception 'Exotic: not a member'; end if;
  if p_kind not in ('text','emote') then raise exception 'Exotic: bad message kind'; end if;
  if char_length(p_body) < 1 or char_length(p_body) > 200 then
    raise exception 'Exotic: bad message'; end if;

  insert into mp.chat (room_id, player_id, kind, body)
  values (p_room, auth.uid(), p_kind, p_body);

  perform mp.award('social');
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it mp.shop_items; p mp.profiles; owned_count int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into it from mp.shop_items where id = p_item and available;
  if not found then raise exception 'Exotic: item unavailable'; end if;
  select * into p from mp.profiles where id = auth.uid() for update;
  if p.novas < it.price then raise exception 'Exotic: not enough Novas'; end if;
  if exists(select 1 from mp.inventory where player_id = auth.uid() and item_id = p_item) then
    raise exception 'Exotic: already owned';
  end if;

  update mp.profiles set novas = novas - it.price where id = auth.uid();
  insert into mp.inventory (player_id, item_id, qty) values (auth.uid(), p_item, 1);
  insert into mp.transactions (player_id, delta, reason)
  values (auth.uid(), -it.price, 'buy:' || p_item);

  select count(*) into owned_count from mp.inventory where player_id = auth.uid();
  if owned_count >= 5 then perform mp.award('collector'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.equip_item(p_item text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it mp.shop_items; inv_row mp.inventory;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into it from mp.shop_items where id = p_item and category in ('cosmetics','frames');
  if not found then raise exception 'Exotic: not equippable'; end if;
  select * into inv_row from mp.inventory
  where player_id = auth.uid() and item_id = p_item and qty > 0;
  if not found then raise exception 'Exotic: not owned'; end if;

  if p_on then
    update mp.inventory set equipped = false
    where player_id = auth.uid() and equipped
      and item_id in (select id from mp.shop_items
                      where effect->>'slot' = it.effect->>'slot');
    update mp.inventory set equipped = true where id = inv_row.id;
    if it.effect->>'slot' = 'avatar' then
      update mp.profiles set avatar = it.icon where id = auth.uid();
    elsif it.effect->>'slot' = 'frame' then
      update mp.profiles set frame = it.effect->>'frame' where id = auth.uid();
    end if;
  else
    update mp.inventory set equipped = false where id = inv_row.id;
    if it.effect->>'slot' = 'avatar' then
      update mp.profiles set avatar = 'sparkles' where id = auth.uid();
    elsif it.effect->>'slot' = 'frame' then
      update mp.profiles set frame = 'none' where id = auth.uid();
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.set_frame(p_frame text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_frame <> 'none' and not exists(
    select 1 from mp.inventory i
    join mp.shop_items s on s.id = i.item_id
    where i.player_id = auth.uid() and s.category = 'frames'
      and s.effect->>'frame' = p_frame
  ) then raise exception 'Exotic: frame not owned'; end if;
  update mp.profiles set frame = p_frame where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p mp.profiles; amount int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into p from mp.profiles where id = auth.uid() for update;
  if p.last_daily = current_date then raise exception 'Exotic: already claimed today'; end if;
  amount := least(80, 20 + p.level * 4);
  update mp.profiles set novas = novas + amount, last_daily = current_date
  where id = auth.uid();
  insert into mp.transactions (player_id, delta, reason)
  values (auth.uid(), amount, 'daily');
  return jsonb_build_object('ok', true, 'amount', amount);
end $$;

create or replace function mp.rename(p_username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if char_length(trim(p_username)) < 2 or char_length(trim(p_username)) > 16 then
    raise exception 'Exotic: name must be 2–16 characters'; end if;
  update mp.profiles set username = trim(p_username) where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.set_avatar(p_icon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update mp.profiles set avatar = p_icon where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp.my_room() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status)
  from mp.rooms r
  join mp.room_players rp on rp.room_id = r.id
  where rp.player_id = auth.uid() and r.status in ('waiting','active')
  order by r.updated_at desc
  limit 1
$$;

create or replace function mp.leaderboard()
returns table (id uuid, username text, avatar text, frame text,
               level int, rank_points int, wins int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar, p.frame, p.level, p.rank_points, p.wins
  from mp.profiles p
  order by p.rank_points desc, p.wins desc
  limit 20
$$;
