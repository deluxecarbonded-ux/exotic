-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0007 — FIX + HARDENING
--  1. sp.submit_guess: `set reward = reward` raised 42702
--     (PL/pgSQL variable vs column ambiguity) and aborted every
--     winning guess. Variable renamed → fixed.
--  2. Orphaned profiles (possible after manual auth.users deletes)
--     are cleaned up.
--  3. sp.profiles / mp.profiles now cascade on user deletion, so
--     removing an account wipes all of its game data everywhere.
-- ═══════════════════════════════════════════════════════════════

create or replace function sp.submit_guess(p_game uuid, p_guess text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g sp.games; secret text; fb jsonb; exact int; partial int;
  base int; bonus int; rew int; dur int;
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
    rew := base + bonus;
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

-- ── Hygiene: drop orphaned profile rows ──────────────────────────
delete from sp.profiles p where not exists (select 1 from auth.users u where u.id = p.id);
delete from mp.profiles p where not exists (select 1 from auth.users u where u.id = p.id);

-- ── Cascade: deleting a user now wipes all their game data ──────
do $$ begin
  alter table sp.profiles
    add constraint sp_profiles_user_fkey
    foreign key (id) references auth.users(id) on delete cascade;
exception
  when duplicate_object then null;
  when others then raise notice 'sp FK skipped: %', sqlerrm;
end $$;

do $$ begin
  alter table mp.profiles
    add constraint mp_profiles_user_fkey
    foreign key (id) references auth.users(id) on delete cascade;
exception
  when duplicate_object then null;
  when others then raise notice 'mp FK skipped: %', sqlerrm;
end $$;
