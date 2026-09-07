-- 0018 · Q&A-only gameplay across solo + duels.
-- Solo: every level is ONE question (riddle / logic / math / trivia / …).
--   Completing it clears the level and unlocks the next one. The 4-digit
--   code pad, its gate and the whole secrets/guesses machinery are gone.
-- Duels: pure question races — the code pad is removed; the match runs to
--   max_rounds and the winner is decided by score.
-- Spare Key (extra-guess) auto-activates at 0:00 (+45s) in solo and unlocks
--   a wrong answer in duels. Digit Lens / Deep Lens reveal answer characters.

-- ════════════════ SP ════════════════

create table sp.questions (
  game_id     uuid primary key references sp.games(id) on delete cascade,
  prompt      text not null,
  answer_kind text not null check (answer_kind in ('word', 'number')),
  answer_len  integer not null default 0,
  answer_text text not null,
  category    text not null default 'mixed',
  tries       integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table sp.questions enable row level security;
alter publication supabase_realtime add table sp.questions;

-- same lenient normalizer the duels use (ال / ة↔ه / ى↔ي / hamza variants /
-- tashkeel / diacritics / eastern digits …)
create or replace function sp.norm_answer(v text, kind text)
 returns text
 language sql
 immutable
as $function$
  with base as (
    select lower(btrim(coalesce(v, ''))) as s
  ),
  zw as (
    select regexp_replace(s, '[\u200B-\u200D\uFEFF\u0621\u0640\u064B-\u065F\u0670]', '', 'g') as s
    from base
  ),
  ar as (
    select regexp_replace(translate(s, 'أإآٱىةؤئ', 'اااايهوي'), '^ال', '') as s
    from zw
  ),
  acc as (
    select public.unaccent(s) as s from ar
  )
  select case
    when kind = 'number' then
      regexp_replace(
        translate(translate(s, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '०१२३४५६७८९', '0123456789'),
        '[^0-9]', '', 'g')
    else
      replace(s, ' ', '')
  end
  from acc
$function$
;

-- client fetches a question from the AI route, then parks it here —
-- the answer is verified server-side from this moment on
create or replace function sp.set_question(p_game uuid, p_prompt text, p_answer text, p_kind text, p_category text default 'mixed')
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare g sp.games; ans text; alen int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then raise exception 'Exotic: game over'; end if;
  if char_length(p_prompt) < 3 or char_length(p_prompt) > 600 then
    raise exception 'Exotic: bad question'; end if;
  if p_kind not in ('word', 'number') then raise exception 'Exotic: bad answer kind'; end if;

  ans := sp.norm_answer(p_answer, p_kind);
  if p_kind = 'number' then
    if ans !~ '^[0-9]{1,6}$' then raise exception 'Exotic: bad answer'; end if;
  else
    ans := regexp_replace(ans, '\s+', '', 'g');
    if ans !~ '^[^\s]{2,16}$' then raise exception 'Exotic: bad answer'; end if;
  end if;
  alen := char_length(ans);

  insert into sp.questions (game_id, prompt, answer_kind, answer_len, answer_text, category)
  values (p_game, p_prompt, p_kind, alen, ans, coalesce(nullif(p_category, ''), 'mixed'))
  on conflict (game_id) do update set
    prompt = excluded.prompt, answer_kind = excluded.answer_kind,
    answer_len = excluded.answer_len, answer_text = excluded.answer_text,
    category = excluded.category, tries = 0, created_at = now();
  return jsonb_build_object('ok', true, 'answer_len', alen);
end $function$
;

-- the level's single answer attempt loop: wrong = shake & try again
-- (only the clock can fail you); right = full reward + unlock flow
create or replace function sp.submit_answer(p_game uuid, p_answer text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  g sp.games; qa sp.questions; given text;
  base int; bonus int; rew int; dur int;
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

  if coalesce(given, '') = '' or given <> qa.answer_text then
    update sp.questions set tries = tries + 1 where game_id = p_game;
    return jsonb_build_object('win', false);
  end if;

  dur := greatest(0, extract(epoch from (now() - g.started_at))::int);
  base := case g.difficulty when 'easy' then 40 when 'medium' then 70 else 120 end;
  bonus := least(60, greatest(0, (g.time_limit - dur) / 2));
  rew := base + bonus + (g.level - 1) * 2;
  if g.double_sparks then rew := rew * 2; end if;

  update sp.games
     set status = 'won', finished_at = now(), duration = dur, reward = rew, xp_earned = 30
   where id = p_game;

  update sp.profiles set
    sparks = sparks + rew, xp = xp + 30,
    wins = wins + 1, games = games + 1, streak = streak + 1,
    best_time = case when best_time is null or dur < best_time then dur else best_time end
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
  if dur <= 60 then new_achs := new_achs || sp.award('speed_60'); end if;
  if g.clues_used = 0 then new_achs := new_achs || sp.award('ghost'); end if;
  if qa.tries = 0 then new_achs := new_achs || sp.award('one_shot'); end if;
  if plvl >= 5 then new_achs := new_achs || sp.award('level_5'); end if;
  if (select sparks from sp.profiles where id = auth.uid()) >= 500 then
    new_achs := new_achs || sp.award('rich_500'); end if;

  return jsonb_build_object('win', true, 'lost', false,
    'reward', rew, 'xp_earned', 30, 'level', g.level, 'next_level', unlocked,
    'player_level', plvl, 'level_up', leveled, 'new_achievements', new_achs,
    'answer', qa.answer_text);
end $function$
;

-- Spare Key auto-activates when the clock hits zero: +45s instead of a loss
create or replace function sp.time_out(p_game uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare g sp.games; inv sp.inventory; ans text;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into g from sp.games where id = p_game for update;
  if not found or g.player_id <> auth.uid() then raise exception 'Exotic: game not found'; end if;
  if g.status <> 'active' then return jsonb_build_object('lost', false); end if;

  select * into inv from sp.inventory
  where player_id = auth.uid() and item_id = 'extra-guess' for update;
  if found and inv.qty > 0 then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    update sp.games set time_limit = time_limit + 45 where id = p_game;
    return jsonb_build_object('lost', false, 'continued', true, 'bonus', 45);
  end if;

  update sp.games set status = 'lost', finished_at = now(),
    duration = greatest(0, extract(epoch from (now() - g.started_at))::int)
  where id = p_game;
  update sp.profiles set games = games + 1, streak = 0, xp = xp + 5
  where id = auth.uid();
  select answer_text into ans from sp.questions where game_id = p_game;
  return jsonb_build_object('lost', true, 'timeout', true, 'answer', coalesce(ans, ''));
end $function$
;

create or replace function sp.start_game(p_difficulty text, p_double boolean default false, p_level integer default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare gid uuid; tl int; lvl int; n int; dbl boolean := coalesce(p_double, false); base_tl int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
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

create or replace function sp.use_item(p_item text, p_game uuid default null)
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

  if p_game is not null and p_item in ('reveal', 'reveal2', 'oracle', 'time-freeze') then
    select * into g from sp.games where id = p_game for update;
    if not found or g.player_id <> auth.uid() or g.status <> 'active' then
      raise exception 'Exotic: game not found';
    end if;
  end if;

  if p_item = 'time-freeze' then
    update sp.inventory set qty = qty - 1 where id = inv.id;
    if p_game is not null then
      update sp.games set time_limit = time_limit + 60 where id = p_game;
    end if;
    return jsonb_build_object('ok', true, 'bonus', 60);

  elsif p_item = 'skip' then
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

  elsif p_item = 'extra-guess' then
    -- the Spare Key activates on its own when the timer hits zero
    raise exception 'Exotic: item is not usable';
  end if;

  raise exception 'Exotic: item is not usable';
end $function$
;

create or replace function sp.check_achs(p_user uuid default null, p_game uuid default null)
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
    if coalesce(g.duration, 999999) <= 60 then nw := nw || sp.award('speed_60', uid); end if;
    if coalesce(g.duration, 999999) <= 30 then nw := nw || sp.award('speed_30', uid); end if;
    if g.clues_used = 0 then nw := nw || sp.award('ghost', uid); end if;
    if coalesce(qtries, 1) = 0 then nw := nw || sp.award('one_shot', uid); end if;
    if g.difficulty = 'hard' then nw := nw || sp.award('hard_win', uid); end if;
  end if;
  return nw;
end $function$
;

drop function if exists sp.submit_guess(uuid, text);
drop function if exists sp.earn_clue(uuid, text);
drop function if exists sp.start_game(text, boolean);
drop table if exists sp.secrets;
drop table if exists sp.guesses;
alter table sp.games
  drop column if exists attempts_max,
  drop column if exists attempts_left,
  drop column if exists clues_max;

-- ════════════════ MP ════════════════

create or replace function mp.create_round(p_room uuid, p_category text, p_prompt text, p_kind text, p_answer text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare r mp.rooms; rid bigint; ans text; alen int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'active' then raise exception 'Exotic: room not active'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host creates rounds'; end if;
  if r.round_no >= r.max_rounds then raise exception 'Exotic: max rounds reached'; end if;
  if char_length(p_prompt) < 3 or char_length(p_prompt) > 600 then
    raise exception 'Exotic: bad question'; end if;
  if p_kind not in ('word', 'number') then raise exception 'Exotic: bad answer kind'; end if;

  ans := mp.norm_answer(p_answer, p_kind);
  if p_kind = 'number' then
    if ans !~ '^[0-9]{1,6}$' then raise exception 'Exotic: bad answer'; end if;
  else
    ans := regexp_replace(ans, '\s+', '', 'g');
    if ans !~ '^[^\s]{2,16}$' then raise exception 'Exotic: bad answer'; end if;
  end if;
  alen := char_length(ans);

  insert into mp.rounds (room_id, match_no, round_no, category, prompt, answer_kind, answer_len)
  values (p_room, r.match_no, r.round_no + 1, p_category, p_prompt, p_kind, alen)
  returning id into rid;

  insert into mp.answers (round_id, answer_text) values (rid, ans);
  update mp.rooms set round_no = r.round_no + 1 where id = p_room;
  return jsonb_build_object('id', rid, 'round_no', r.round_no + 1);
end $function$
;

create or replace function mp.start_match(p_room uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
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

  update mp.rooms set status = 'active', round_no = 0, winner_id = null
  where id = p_room;
  update mp.room_players set score = 0, ready = false
  where room_id = p_room;
  return jsonb_build_object('ok', true);
end $function$
;

create or replace function mp.rematch(p_room uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host can rematch'; end if;
  if r.status <> 'finished' then raise exception 'Exotic: match still running'; end if;

  update mp.rooms set status = 'active', match_no = match_no + 1,
    round_no = 0, winner_id = null
  where id = p_room;
  update mp.room_players set score = 0, ready = true
  where room_id = p_room;
  return jsonb_build_object('ok', true, 'match_no', r.match_no + 1);
end $function$
;

create or replace function mp.answer_round(p_room uuid, p_round bigint, p_answer text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare r mp.rooms; rd mp.rounds; ans text; given text;
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

  select answer_text into ans from mp.answers where round_id = p_round;
  given := mp.norm_answer(p_answer, rd.answer_kind);
  if rd.answer_kind = 'word' then
    given := regexp_replace(given, '\s+', '', 'g');
  end if;

  if given = ans and char_length(given) > 0 then
    update mp.rounds set answered_by = auth.uid() where id = p_round;
    update mp.room_players set score = score + 1
    where room_id = p_room and player_id = auth.uid();
    return jsonb_build_object('correct', true);
  end if;

  update mp.rounds set wrong_by = array_append(wrong_by, auth.uid()) where id = p_round;
  return jsonb_build_object('correct', false);
end $function$
;

-- race over: highest score takes the duel, dead even = draw
create or replace function mp.end_match(p_room uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  r mp.rooms; w uuid; l uuid; ws int; ls int; tmp uuid; tmpi int;
  winner_reward int; new_achs text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host'; end if;
  if r.status <> 'active' then return jsonb_build_object('ok', true); end if;

  select player_id, score into w, ws from mp.room_players
  where room_id = p_room order by player_id limit 1;
  select player_id, score into l, ls from mp.room_players
  where room_id = p_room order by player_id desc limit 1;
  if w = l or w is null or l is null then return jsonb_build_object('ok', true); end if;

  if ws < ls then
    tmp := w; w := l; l := tmp;
    tmpi := ws; ws := ls; ls := tmpi;
  end if;

  if ws = ls then
    perform mp.finish_draw(p_room);
    return jsonb_build_object('ok', true, 'draw', true);
  end if;

  winner_reward := 60 + ws * 10;
  update mp.rooms set status = 'finished', winner_id = w where id = p_room;

  update mp.profiles set
    novas = novas + winner_reward, wins = wins + 1, games = games + 1,
    streak = streak + 1, best_streak = greatest(best_streak, streak + 1),
    xp = xp + 40, rank_points = rank_points + 25
  where id = w;

  update mp.profiles set
    novas = novas + 15, losses = losses + 1, games = games + 1,
    streak = 0, xp = xp + 10, rank_points = greatest(100, rank_points - 20)
  where id = l;

  insert into mp.transactions (player_id, delta, reason)
  values (w, winner_reward, 'duel-win:' || p_room),
         (l, 15, 'duel-loss:' || p_room);

  perform mp.sync_level(w);
  new_achs := new_achs || mp.award('first_win', w);
  if (select streak from mp.profiles where id = w) >= 3 then
    new_achs := new_achs || mp.award('streak_3', w); end if;
  if (select streak from mp.profiles where id = w) >= 5 then
    new_achs := new_achs || mp.award('streak_5', w); end if;
  if (select wins from mp.profiles where id = w) >= 10 then
    new_achs := new_achs || mp.award('winner_10', w); end if;
  if (select rank_points from mp.profiles where id = w) >= 1100 then
    new_achs := new_achs || mp.award('rank_1100', w); end if;
  if (select level from mp.profiles where id = w) >= 5 then
    new_achs := new_achs || mp.award('level_5', w); end if;

  return jsonb_build_object('ok', true, 'winner_id', w,
    'reward', winner_reward, 'new_achievements', new_achs);
end $function$
;

-- Extra Guess in a duel: unlock yourself from a round you got wrong
create or replace function mp.use_item(p_item text, p_room uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
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
    update mp.rounds set wrong_by = array_remove(wrong_by, auth.uid())
    where room_id = p_room and match_no = r.match_no and round_no = r.round_no
      and answered_by is null and auth.uid() = any(wrong_by);
    if not found then raise exception 'Exotic: you are not locked out'; end if;
    update mp.inventory set qty = qty - 1 where id = inv.id;
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Exotic: item is not usable';
end $function$
;

drop function if exists mp.submit_guess(uuid, text);
drop table if exists mp.secrets;
drop table if exists mp.guesses;
alter table mp.room_players drop column if exists guesses_left;
alter table mp.rounds drop column if exists clue;

-- ════════════════ orphaned code helpers ════════════════

drop function if exists public.gen_code();
drop function if exists public.code_feedback(text, text);
drop function if exists public.make_clue(text, text);
