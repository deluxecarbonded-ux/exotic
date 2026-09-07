-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0008 — 30-LEVEL CAMPAIGN + TYPED ANSWERS
--  • sp: 30 levels per difficulty (easy/medium/hard), each level
--    scales attempts / clues / time. Winning a level unlocks the
--    next one (stored per difficulty in sp.profiles.levels).
--  • mp: rounds are answered by TYPING the answer (word or number)
--    instead of picking from options — keyboards replace choices.
-- ═══════════════════════════════════════════════════════════════

-- ── SP: level progression storage ────────────────────────────────
alter table sp.profiles
  add column if not exists levels jsonb not null
  default '{"easy":1,"medium":1,"hard":1}';

alter table sp.games
  add column if not exists level int not null default 1;

-- ── SP: start_game with level scaling ────────────────────────────
create or replace function sp.start_game(p_difficulty text, p_double boolean default false, p_level int default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gid uuid; att int; cl int; tl int; lvl int;
  dbl boolean := coalesce(p_double, false);
  base_att int; base_cl int; base_tl int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_difficulty = 'easy'   then base_att := 6; base_cl := 8; base_tl := 240;
  elsif p_difficulty = 'medium' then base_att := 5; base_cl := 6; base_tl := 180;
  elsif p_difficulty = 'hard'   then base_att := 4; base_cl := 4; base_tl := 150;
  else raise exception 'Exotic: unknown difficulty'; end if;

  lvl := least(30, greatest(1, coalesce(p_level, 1)));
  if (coalesce((select (levels->>p_difficulty)::int from sp.profiles where id = auth.uid()), 1)) < lvl then
    raise exception 'Exotic: level locked';
  end if;

  -- every level climbs: fewer attempts, fewer clues, less time
  att := greatest(2, base_att - floor((lvl - 1) / 10));
  cl  := greatest(2, base_cl  - floor((lvl - 1) / 6));
  tl  := greatest(60, base_tl - (lvl - 1) * 5);

  if dbl then
    update sp.inventory set qty = qty - 1
    where player_id = auth.uid() and item_id = 'double' and qty > 0;
    get diagnostics tl = row_count;
    if tl = 0 then dbl := false; end if;
  end if;

  insert into sp.games (player_id, difficulty, level, attempts_max, attempts_left, clues_max, time_limit, double_sparks)
  values (auth.uid(), p_difficulty, lvl, att, att, cl, tl, dbl)
  returning id into gid;

  insert into sp.secrets (game_id, code) values (gid, public.gen_code());

  return jsonb_build_object('id', gid, 'time_limit', tl, 'level', lvl,
                            'attempts_max', att, 'clues_max', cl);
end $$;

-- ── SP: winning a level unlocks the next one ─────────────────────
create or replace function sp.submit_guess(p_game uuid, p_guess text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g sp.games; secret text; fb jsonb; exact int; partial int;
  base int; bonus int; rew int; dur int;
  new_xp int; lvl int; leveled boolean := false; new_achs text[] := '{}';
  unlocked int := 0; prog int;
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
    rew := base + bonus + (g.level - 1) * 2;
    if g.double_sparks then rew := rew * 2; end if;

    update sp.games
       set status = 'won', attempts_left = g.attempts_left - 1,
           finished_at = now(), duration = dur, reward = rew, xp_earned = 30
     where id = p_game;

    update sp.profiles set
      sparks = sparks + rew, xp = xp + 30,
      wins = wins + 1, games = games + 1, streak = streak + 1,
      best_time = case when best_time is null or dur < best_time then dur else best_time end
    where id = auth.uid();

    insert into sp.transactions (player_id, delta, reason)
    values (auth.uid(), rew, 'win:' || p_game);

    -- level progression: clear the current level → unlock the next
    select coalesce((levels->>g.difficulty)::int, 1) into prog
    from sp.profiles where id = auth.uid();
    if g.level = prog and prog < 30 then
      unlocked := prog + 1;
      update sp.profiles
         set levels = jsonb_set(levels, array[g.difficulty], to_jsonb(unlocked))
       where id = auth.uid();
    end if;

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
      'attempts_left', g.attempts_left - 1, 'reward', rew, 'xp_earned', 30,
      'level', g.level, 'next_level', unlocked,
      'player_level', lvl, 'level_up', leveled, 'new_achievements', new_achs,
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

-- ── MP: typed-answer rounds ──────────────────────────────────────
alter table mp.rounds
  add column if not exists answer_kind text not null default 'word'
    check (answer_kind in ('word','number')),
  add column if not exists answer_len int not null default 0;
alter table mp.rounds alter column options drop not null;
alter table mp.answers add column if not exists answer_text text;
alter table mp.answers alter column answer_index drop not null;

-- normalize a typed answer: lowercase, trim; numbers = digits only
create or replace function mp.norm_answer(v text, kind text)
returns text language sql immutable as $$
  select case
    when kind = 'number' then regexp_replace(lower(btrim(coalesce(v, ''))), '[^0-9]', '', 'g')
    else lower(btrim(coalesce(v, '')))
  end
$$;

drop function if exists mp.create_round(uuid, text, text, jsonb, int);
create or replace function mp.create_round(
  p_room uuid, p_category text, p_prompt text, p_kind text, p_answer text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r mp.rooms; clue jsonb; secret text; rid bigint; ans text; alen int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into r from mp.rooms where id = p_room for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'active' then raise exception 'Exotic: room not active'; end if;
  if r.host_id <> auth.uid() then raise exception 'Exotic: only the host creates rounds'; end if;
  if r.round_no >= r.max_rounds then raise exception 'Exotic: max rounds reached'; end if;
  if char_length(p_prompt) < 3 or char_length(p_prompt) > 600 then
    raise exception 'Exotic: bad question'; end if;
  if p_kind not in ('word','number') then raise exception 'Exotic: bad answer kind'; end if;

  ans := mp.norm_answer(p_answer, p_kind);
  if p_kind = 'number' then
    if ans !~ '^[0-9]{1,6}$' then raise exception 'Exotic: bad answer'; end if;
  else
    ans := regexp_replace(ans, '\s+', '', 'g');
    if ans !~ '^[^\s]{2,16}$' then raise exception 'Exotic: bad answer'; end if;
  end if;
  alen := char_length(ans);

  select code into secret from mp.secrets where room_id = p_room;
  clue := public.make_clue(secret);

  insert into mp.rounds (room_id, match_no, round_no, category, prompt, answer_kind, answer_len, clue)
  values (p_room, r.match_no, r.round_no + 1, p_category, p_prompt, p_kind, alen, clue)
  returning id into rid;

  insert into mp.answers (round_id, answer_text) values (rid, ans);
  update mp.rooms set round_no = r.round_no + 1 where id = p_room;
  return jsonb_build_object('id', rid, 'round_no', r.round_no + 1, 'clue', clue);
end $$;

drop function if exists mp.answer_round(uuid, bigint, int);
create or replace function mp.answer_round(p_room uuid, p_round bigint, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    update mp.room_players set score = score + 1, guesses_left = guesses_left + 1
    where room_id = p_room and player_id = auth.uid();
    return jsonb_build_object('correct', true);
  end if;

  update mp.rounds set wrong_by = array_append(wrong_by, auth.uid()) where id = p_round;
  return jsonb_build_object('correct', false);
end $$;
