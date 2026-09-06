-- 0014: single-player keeps ONE active game per player.
-- Starting a new game auto-abandons any stale 'active' rows (e.g. the
-- player closed the tab mid-game — previously those stayed 'active'
-- forever and piled up as orphans).

create or replace function sp.start_game(p_difficulty text, p_double boolean default false, p_level int default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gid uuid; att int; cl int; tl int; lvl int; n int;
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

  -- one active game per player: retire anything stale first
  update sp.games set status = 'abandoned', finished_at = now()
  where player_id = auth.uid() and status = 'active';

  -- every level climbs: fewer attempts, fewer clues, less time
  att := greatest(2, base_att - floor((lvl - 1) / 10));
  cl  := greatest(2, base_cl  - floor((lvl - 1) / 6));
  tl  := greatest(60, base_tl - (lvl - 1) * 5);

  if dbl then
    update sp.inventory set qty = qty - 1
    where player_id = auth.uid() and item_id = 'double' and qty > 0;
    get diagnostics n = row_count;  -- row_count, NOT tl (0008 clobbered the time limit!)
    if n = 0 then dbl := false; end if;
  end if;

  insert into sp.games (player_id, difficulty, level, attempts_max, attempts_left, clues_max, time_limit, double_sparks)
  values (auth.uid(), p_difficulty, lvl, att, att, cl, tl, dbl)
  returning id into gid;

  insert into sp.secrets (game_id, code) values (gid, public.gen_code());

  return jsonb_build_object('id', gid, 'time_limit', tl, 'level', lvl,
                            'attempts_max', att, 'clues_max', cl);
end $$;
