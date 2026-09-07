-- 0016: REAL ACHIEVEMENTS + SHOP ITEMS + LEADERBOARDS + REALTIME EVERYWHERE
--  • Achievements: expanded catalogs (SP 18 / MP 14), centralized
--    check_achs() evaluators, auto-award triggers on profile/game/room
--    changes (fully self-healing — every stat change re-evaluates).
--  • Shop: SP "skip" (skip question) + "reveal2" (deep lens, 2 digits);
--    MP "guess-plus" (extra duel guess) + mp.use_item RPC.
--  • Leaderboards: sp/mp.leaderboard(p_kind) — wins | sparks | level |
--    time | streak (SP) and rank | wins | novas | streak | level (MP).
--  • Metric indexes + realtime publication on every game table.

-- ═══════════════ ACHIEVEMENT CATALOGS ═══════════════

insert into sp.achievements_catalog (id, name, icon, reward) values
  ('win_10',   'Decade of Cracks', 'trophy', 40),
  ('win_50',   'Code Veteran',     'crown',  100),
  ('speed_30', 'Lightning Bolt',   'zap',    60),
  ('one_shot', 'Bullseye',         'target', 60),
  ('level_10', 'Supreme Mind',     'star',   80),
  ('rich_1000','Spark Tycoon',     'gem',    100),
  ('camp10',   'Campaign Climber', 'flag',   50),
  ('camp30',   'Campaign King',    'crown',  200),
  ('hard_win', 'Hard Mode',        'skull',  40),
  ('games_25', 'Persistent',       'timer',  40)
on conflict (id) do nothing;

insert into mp.achievements_catalog (id, name, icon, reward) values
  ('winner_25', 'Duel Legend',     'crown',  100),
  ('rank_1300', 'Silver Tongue',   'trend',  50),
  ('rank_1500', 'Gold Standard',   'medal',  80),
  ('level_10',  'Champion',        'star',   80),
  ('novas_500', 'Nova Bank',       'gem',    60),
  ('games_25',  'Regular',         'timer',  40)
on conflict (id) do nothing;

-- ═══════════════ AWARD (player-parameterized for triggers) ═══════════════

create or replace function sp.award(p_id text, p_user uuid default null) returns text[]
language plpgsql security definer set search_path = '' as $$
declare r int; uid uuid := coalesce(p_user, auth.uid());
begin
  if uid is null then return '{}'; end if;
  insert into sp.player_achievements (player_id, achievement_id)
  values (uid, p_id)
  on conflict do nothing;
  get diagnostics r = row_count;
  if r > 0 then
    update sp.profiles set sparks = sparks +
      coalesce((select reward from sp.achievements_catalog where id = p_id), 0)
    where id = uid;
    return array[p_id];
  end if;
  return '{}';
end $$;

create or replace function mp.award(p_id text, p_user uuid default null) returns text[]
language plpgsql security definer set search_path = '' as $$
declare r int; uid uuid := coalesce(p_user, auth.uid());
begin
  if uid is null then return '{}'; end if;
  insert into mp.player_achievements (player_id, achievement_id)
  values (uid, p_id)
  on conflict do nothing;
  get diagnostics r = row_count;
  if r > 0 then
    update mp.profiles set novas = novas +
      coalesce((select reward from mp.achievements_catalog where id = p_id), 0)
    where id = uid;
    return array[p_id];
  end if;
  return '{}';
end $$;

-- ═══════════════ CENTRALIZED ACHIEVEMENT EVALUATORS ═══════════════

create or replace function sp.check_achs(p_user uuid default null, p_game uuid default null)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
  p sp.profiles; g sp.games; nw text[] := '{}';
  gc int := 0; maxlvl int := 1;
begin
  if uid is null then return '{}'; end if;
  select * into p from sp.profiles where id = uid;
  if not found then return '{}'; end if;
  if p_game is not null then
    select * into g from sp.games where id = p_game;
    select count(*) into gc from sp.guesses where game_id = p_game;
  end if;
  maxlvl := greatest(
    coalesce((p.levels->>'easy')::int, 1),
    coalesce((p.levels->>'medium')::int, 1),
    coalesce((p.levels->>'hard')::int, 1));

  if p.wins >= 1   then nw := nw || sp.award('first_win', uid); end if;
  if p.wins >= 10  then nw := nw || sp.award('win_10', uid); end if;
  if p.wins >= 50  then nw := nw || sp.award('win_50', uid); end if;
  if p.streak >= 3 then nw := nw || sp.award('streak_3', uid); end if;
  if p.streak >= 5 then nw := nw || sp.award('streak_5', uid); end if;
  if p.games >= 25 then nw := nw || sp.award('games_25', uid); end if;
  if p.level >= 5  then nw := nw || sp.award('level_5', uid); end if;
  if p.level >= 10 then nw := nw || sp.award('level_10', uid); end if;
  if p.sparks >= 500  then nw := nw || sp.award('rich_500', uid); end if;
  if p.sparks >= 1000 then nw := nw || sp.award('rich_1000', uid); end if;
  if maxlvl >= 11 then nw := nw || sp.award('camp10', uid); end if;
  if maxlvl >= 30 then nw := nw || sp.award('camp30', uid); end if;

  if p_game is not null and g.status = 'won' then
    if coalesce(g.duration, 999999) <= 60 then nw := nw || sp.award('speed_60', uid); end if;
    if coalesce(g.duration, 999999) <= 30 then nw := nw || sp.award('speed_30', uid); end if;
    if g.clues_used = 0 then nw := nw || sp.award('ghost', uid); end if;
    if gc <= 1 then nw := nw || sp.award('one_shot', uid); end if;
    if g.difficulty = 'hard' then nw := nw || sp.award('hard_win', uid); end if;
  end if;
  return nw;
end $$;

create or replace function mp.check_achs(p_user uuid default null)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
  p mp.profiles; nw text[] := '{}';
begin
  if uid is null then return '{}'; end if;
  select * into p from mp.profiles where id = uid;
  if not found then return '{}'; end if;

  if p.wins >= 1   then nw := nw || mp.award('first_win', uid); end if;
  if p.wins >= 10  then nw := nw || mp.award('winner_10', uid); end if;
  if p.wins >= 25  then nw := nw || mp.award('winner_25', uid); end if;
  if p.streak >= 3 then nw := nw || mp.award('streak_3', uid); end if;
  if p.streak >= 5 then nw := nw || mp.award('streak_5', uid); end if;
  if p.games >= 25 then nw := nw || mp.award('games_25', uid); end if;
  if p.level >= 5  then nw := nw || mp.award('level_5', uid); end if;
  if p.level >= 10 then nw := nw || mp.award('level_10', uid); end if;
  if p.rank_points >= 1100 then nw := nw || mp.award('rank_1100', uid); end if;
  if p.rank_points >= 1300 then nw := nw || mp.award('rank_1300', uid); end if;
  if p.rank_points >= 1500 then nw := nw || mp.award('rank_1500', uid); end if;
  if p.novas >= 500 then nw := nw || mp.award('novas_500', uid); end if;
  return nw;
end $$;

-- ═══════════════ AUTO-AWARD TRIGGERS (self-healing) ═══════════════

create or replace function sp.achs_profile_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform sp.check_achs(new.id);
  return null;
end $$;

drop trigger if exists sp_achs_profile on sp.profiles;
create trigger sp_achs_profile after update on sp.profiles
for each row execute function sp.achs_profile_trg();

create or replace function sp.achs_game_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform sp.check_achs(coalesce(new.player_id, auth.uid()), new.id);
  return null;
end $$;

drop trigger if exists sp_achs_game on sp.games;
create trigger sp_achs_game after update of status on sp.games
for each row when (old.status = 'active' and new.status in ('won','lost'))
execute function sp.achs_game_trg();

create or replace function mp.achs_profile_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform mp.check_achs(new.id);
  return null;
end $$;

drop trigger if exists mp_achs_profile on mp.profiles;
create trigger mp_achs_profile after update on mp.profiles
for each row execute function mp.achs_profile_trg();

-- ═══════════════ SHOP: NEW REAL ITEMS ═══════════════

-- allow the new consumables category on the duel shop
alter table mp.shop_items drop constraint if exists shop_items_category_check;
alter table mp.shop_items add constraint shop_items_category_check
  check (category in ('emotes','cosmetics','frames','consumables'));

insert into sp.shop_items (id, category, icon, name, description, price, effect, featured) values
  ('skip',    'consumables', 'skip',  'Skip Ticket', 'Skip the current question — a fresh one takes its place.', 25, '{}', false),
  ('reveal2', 'consumables', 'eye',   'Deep Lens',   'Reveals TWO digits and their exact positions.',            100, '{}', true)
on conflict (id) do nothing;

insert into mp.shop_items (id, category, icon, name, description, price, effect, featured) values
  ('guess-plus', 'consumables', 'key', 'Extra Guess', 'Grants one extra code guess during a duel.', 70, '{}', true)
on conflict (id) do nothing;

-- sp.use_item: add "skip" (question swap) + "reveal2" (two distinct digits)
create or replace function sp.use_item(p_item text, p_game uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv sp.inventory; g sp.games; secret text; clue jsonb; clue2 jsonb;
  p1 int; p2 int; d1 int; d2 int;
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

  elsif p_item = 'skip' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);

  elsif p_item = 'oracle' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);

  elsif p_item in ('reveal','reveal2') then
    if p_game is null then raise exception 'Exotic: no active game'; end if;
    select * into g from sp.games where id = p_game for update;
    if not found or g.player_id <> auth.uid() or g.status <> 'active' then
      raise exception 'Exotic: game not found'; end if;
    select code into secret from sp.secrets where game_id = p_game;

    if p_item = 'reveal' then
      clue := public.make_clue(secret, 'position');
      insert into sp.clues (game_id, kind, payload)
      values (p_game, 'position', clue->'payload');
      update sp.inventory set qty = qty - 1 where id = inv.id;
      return jsonb_build_object('ok', true, 'clue', clue);
    end if;

    -- reveal2: two DISTINCT positions
    p1 := 1 + floor(random() * 4)::int;
    p2 := 1 + ((p1 + 1 + floor(random() * 3)::int) % 4);
    d1 := substr(secret, p1, 1)::int;
    d2 := substr(secret, p2, 1)::int;
    clue  := jsonb_build_object('kind','position','payload',jsonb_build_object('pos',p1,'d',d1));
    clue2 := jsonb_build_object('kind','position','payload',jsonb_build_object('pos',p2,'d',d2));
    insert into sp.clues (game_id, kind, payload)
    values (p_game, 'position', clue->'payload'), (p_game, 'position', clue2->'payload');
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true, 'clue', clue, 'clue2', clue2);
  end if;

  raise exception 'Exotic: item is not usable';
end $$;

-- mp.use_item: duel consumables (guess-plus)
create or replace function mp.use_item(p_item text, p_room uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv mp.inventory; r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into inv from mp.inventory
  where player_id = auth.uid() and item_id = p_item for update;
  if not found or inv.qty <= 0 then raise exception 'Exotic: item not owned'; end if;

  if p_item = 'guess-plus' then
    if p_room is null then raise exception 'Exotic: room not found'; end if;
    select * into r from mp.rooms where id = p_room for update;
    if not found then raise exception 'Exotic: room not found'; end if;
    if r.status <> 'active' then raise exception 'Exotic: room not active'; end if;
    if not mp.is_member(p_room) then raise exception 'Exotic: not a member'; end if;
    update mp.room_players set guesses_left = guesses_left + 1
    where room_id = p_room and player_id = auth.uid();
    update mp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Exotic: item is not usable';
end $$;

-- ═══════════════ LEADERBOARDS (every metric) ═══════════════

drop function if exists sp.leaderboard();
create or replace function sp.leaderboard(p_kind text default 'wins')
returns table (id uuid, username text, avatar text, level int, value bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select p.id, p.username, p.avatar, p.level, p.sparks,
           case $1
             when 'sparks' then p.sparks
             when 'level'  then p.level
             when 'time'   then coalesce(p.best_time, 999999)
             when 'streak' then p.streak
             else p.wins
           end as val,
           ($1 = 'time') as is_time
    from sp.profiles p
    where p.username <> 'Player'
  )
  select id, username, avatar, level, val from ranked
  order by (case when is_time then val end) asc nulls last,
           (case when not is_time then val end) desc nulls last,
           sparks desc
  limit 20
$$;

drop function if exists mp.leaderboard();
create or replace function mp.leaderboard(p_kind text default 'rank')
returns table (id uuid, username text, avatar text, frame text, level int, value bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select p.id, p.username, p.avatar, p.frame, p.level, p.wins,
           case $1
             when 'wins'   then p.wins
             when 'novas'  then p.novas
             when 'streak' then p.best_streak
             when 'level'  then p.level
             else p.rank_points
           end as val
    from mp.profiles p
    where p.games > 0
  )
  select id, username, avatar, frame, level, val from ranked
  order by val desc, wins desc
  limit 20
$$;

-- board metric indexes
create index if not exists sp_profiles_wins_idx   on sp.profiles (wins desc);
create index if not exists sp_profiles_sparks_idx on sp.profiles (sparks desc);
create index if not exists sp_profiles_level_idx  on sp.profiles (level desc);
create index if not exists sp_profiles_streak_idx on sp.profiles (streak desc);
create index if not exists sp_profiles_time_idx   on sp.profiles (best_time asc);
create index if not exists mp_profiles_rank_idx   on mp.profiles (rank_points desc);
create index if not exists mp_profiles_wins_idx   on mp.profiles (wins desc);
create index if not exists mp_profiles_novas_idx  on mp.profiles (novas desc);
create index if not exists mp_profiles_streak_idx on mp.profiles (best_streak desc);
create index if not exists mp_profiles_level_idx  on mp.profiles (level desc);

-- ═══════════════ REALTIME ON EVERY GAME TABLE ═══════════════
-- (secrets stay out of the stream — codes must never be broadcast)
do $$
declare t text;
begin
  for t in
    select schemaname || '.' || tablename
    from pg_tables
    where schemaname in ('sp','mp')
      and tablename not in ('secrets')
  loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
