-- 0024 — Remove the SP timer completely.
--   · submit_answer: flat time bonus removed — reward = base + level scaling
--   · submit_answer / check_achs: speed_30 / speed_60 achievements dropped
--   · leaderboard: 'time' kind removed (Best Time leaderboard gone)
--   · time_out(): no longer ends the game — there is no clock to run out
--   · use_item(): time-freeze / extra-guess branches removed
--   · extra-guess / time-freeze shop items delisted (no timer to serve)
--   · speed achievements purged from the catalog + player records
--   · best_time column kept (historical data, no longer written/read)

-- ── sp.submit_answer — no time bonus, no speed achievements ──
create or replace function sp.submit_answer(p_game uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  g sp.games; qa sp.questions; given text;
  base int; rew int; dur int;
  new_xp int; plvl int; leveled boolean := false; new_achs text[] := '{}';
  unlocked int := 0; prog int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then raise exception 'Exotic: game over'; end if;
  select * into qa from sp.questions where game_id = p_game;
  if not found then raise exception 'Exotic: no question'; end if;

  given := sp.norm_answer(p_answer, qa.answer_kind);
  if qa.answer_kind = 'word' then
    given := regexp_replace(given, '\s+', '', 'g');
  end if;

  if coalesce(given, '') = '' or (given <> qa.answer_text and not public.same_answer_group(given, qa.answer_text, qa.answer_kind)) then
    update sp.questions set tries = tries + 1 where game_id = p_game;
    return jsonb_build_object('win', false);
  end if;

  dur := greatest(0, extract(epoch from (now() - g.started_at))::int);
  base := case g.difficulty when 'easy' then 40 when 'medium' then 70 else 120 end;
  rew := base + (g.level - 1) * 2;
  if g.double_sparks then rew := rew * 2; end if;

  update sp.games
     set status = 'won', finished_at = now(), duration = dur, reward = rew, xp_earned = 30
   where id = p_game;

  update sp.profiles set
    sparks = sparks + rew, xp = xp + 30,
    wins = wins + 1, games = games + 1, streak = streak + 1
  where id = auth.uid();

  insert into sp.transactions (player_id, delta, reason)
  values (auth.uid(), rew, 'win:' || p_game);

  -- completing level N unlocks level N+1
  select coalesce((levels->>g.difficulty)::int, 1) into prog
  from sp.profiles where id = auth.uid();
  if g.level = prog and prog < 30 then
    unlocked := prog + 1;
    update sp.profiles
       set levels = jsonb_set(levels, array[g.difficulty], to_jsonb(unlocked))
     where id = auth.uid();
  end if;

  select level, xp into plvl, new_xp from sp.profiles where id = auth.uid();
  while new_xp >= plvl * 100 loop plvl := plvl + 1; leveled := true; end loop;
  if leveled then update sp.profiles set level = plvl where id = auth.uid(); end if;

  new_achs := new_achs || sp.award('first_win');
  if (select streak from sp.profiles where id = auth.uid()) >= 3 then
    new_achs := new_achs || sp.award('streak_3'); end if;
  if (select streak from sp.profiles where id = auth.uid()) >= 5 then
    new_achs := new_achs || sp.award('streak_5'); end if;
  if g.clues_used = 0 then new_achs := new_achs || sp.award('ghost'); end if;
  if qa.tries = 0 then new_achs := new_achs || sp.award('one_shot'); end if;
  if plvl >= 5 then new_achs := new_achs || sp.award('level_5'); end if;
  if (select sparks from sp.profiles where id = auth.uid()) >= 500 then
    new_achs := new_achs || sp.award('rich_500'); end if;

  return jsonb_build_object('win', true, 'lost', false,
    'reward', rew, 'xp_earned', 30, 'level', g.level, 'next_level', unlocked,
    'player_level', plvl, 'level_up', leveled, 'new_achievements', new_achs,
    'answer', qa.answer_text);
end $function$;

-- ── sp.check_achs — drop the speed achievements (same signature as before) ──
create or replace function sp.check_achs(p_user uuid default null::uuid, p_game uuid default null::uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := coalesce(p_user, auth.uid());
  p sp.profiles; g sp.games; nw text[] := '{}';
  qtries int := null; maxlvl int := 1;
begin
  if uid is null then return '{}'; end if;
  select * into p from sp.profiles where id = uid;
  if not found then return '{}'; end if;
  if p_game is not null then
    select * into g from sp.games where id = p_game;
    select tries into qtries from sp.questions where game_id = p_game;
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
    if g.clues_used = 0 then nw := nw || sp.award('ghost', uid); end if;
    if coalesce(qtries, 1) = 0 then nw := nw || sp.award('one_shot', uid); end if;
    if g.difficulty = 'hard' then nw := nw || sp.award('hard_win', uid); end if;
  end if;
  return nw;
end $function$;

-- ── sp.leaderboard — no more 'time' kind ──
create or replace function sp.leaderboard(p_kind text default 'wins')
returns table(id uuid, username text, avatar text, level integer, value bigint)
language sql
stable security definer
set search_path = ''
as $function$
  select p.id, p.username, p.avatar, p.level,
         case p_kind
           when 'sparks' then p.sparks::bigint
           when 'level'  then p.level::bigint
           when 'streak' then p.streak::bigint
           else p.wins::bigint
         end as value
  from sp.profiles p
  where p.username <> 'Player'
  order by case p_kind
             when 'sparks' then p.sparks
             when 'level'  then p.level
             when 'streak' then p.streak
             else p.wins
           end desc,
           p.sparks desc
  limit 20
$function$;

-- ── sp.time_out — the clock is gone; calling it can no longer end a game ──
create or replace function sp.time_out(p_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare g sp.games;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then return jsonb_build_object('lost', false); end if;
  /* no timer anymore — a timeout is simply not a thing */
  return jsonb_build_object('lost', false, 'timeout', false);
end $function$;

-- ── sp.use_item — original body minus the time-freeze / extra-guess branches ──
create or replace function sp.use_item(p_item text, p_game uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  inv sp.inventory; g sp.games; qa sp.questions;
  clue jsonb; clue2 jsonb; p1 int; p2 int; ck text;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into inv from sp.inventory
  where player_id = auth.uid() and item_id = p_item for update;
  if not found or inv.qty <= 0 then raise exception 'Exotic: item not owned'; end if;

  if p_game is not null and p_item in ('reveal', 'reveal2', 'oracle') then
    select * into g from sp.games where id = p_game for update;
    if not found or g.player_id <> auth.uid() or g.status <> 'active' then
      raise exception 'Exotic: game not found';
    end if;
  end if;

  if p_item = 'skip' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);

  elsif p_item = 'oracle' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    if p_game is not null then
      update sp.games set clues_used = clues_used + 1 where id = p_game;
    end if;
    return jsonb_build_object('ok', true);

  elsif p_item in ('reveal', 'reveal2') then
    if p_game is null then raise exception 'Exotic: no active game'; end if;
    select * into qa from sp.questions where game_id = p_game;
    if not found then raise exception 'Exotic: no question'; end if;
    ck := case when qa.answer_kind = 'number' then 'digit' else 'letter' end;

    p1 := 1 + floor(random() * greatest(1, qa.answer_len))::int;
    clue := jsonb_build_object('kind', ck,
      'payload', jsonb_build_object('p', p1, 'ch', substr(qa.answer_text, p1, 1)));

    if p_item = 'reveal' or qa.answer_len < 2 then
      insert into sp.clues (game_id, kind, payload) values (p_game, ck, clue->'payload');
      update sp.games set clues_used = clues_used + 1 where id = p_game;
      update sp.inventory set qty = qty - 1 where id = inv.id;
      return jsonb_build_object('ok', true, 'clue', clue);
    end if;

    -- reveal2: a second, distinct position
    p2 := p1;
    while p2 = p1 loop
      p2 := 1 + floor(random() * qa.answer_len)::int;
    end loop;
    clue2 := jsonb_build_object('kind', ck,
      'payload', jsonb_build_object('p', p2, 'ch', substr(qa.answer_text, p2, 1)));
    insert into sp.clues (game_id, kind, payload)
    values (p_game, ck, clue->'payload'), (p_game, ck, clue2->'payload');
    update sp.games set clues_used = clues_used + 1 where id = p_game;
    update sp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true, 'clue', clue, 'clue2', clue2);
  end if;

  raise exception 'Exotic: item is not usable';
end $function$;

-- ── purge the timer-race achievements ──
delete from sp.player_achievements where achievement_id in ('speed_30', 'speed_60');
delete from sp.achievements_catalog where id in ('speed_30', 'speed_60');

-- ── delist the timer consumables (existing stock stays, just unpurchasable) ──
update sp.shop_items set available = false where id in ('extra-guess', 'time-freeze');
