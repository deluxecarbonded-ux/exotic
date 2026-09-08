-- 0017: LEVELS ON MP + LEVEL-COMPLETION LEADERBOARDS + LEVEL SHARES
--  sp.profiles already has levels jsonb (easy/medium/hard) updated by the
--  solo campaign. mp.profiles did NOT — add it so duel players climb
--  30 levels per difficulty too (one duel win = clear the current level).
--  Then add leaderboard_by_level() for both schemas so the hubs and the
--  level-completion modal can rank players by how far they've climbed,
--  plus opt-in "share my completion to the game leaderboards" support
--  (level_shares tables + share_level_completion RPCs, fully RLS'd).

-- ═══════════════ MP PROFILES: levels jsonb ═══════════════

alter table mp.profiles
  add column if not exists levels jsonb
    not null default '{"easy": 1, "medium": 1, "hard": 1}'::jsonb;

create index if not exists mp_profiles_levels_idx on mp.profiles
  using gin (levels);

-- ═══════════════ MP: a duel win clears the winner's current level ═══════════════
--  Mirrors the solo campaign: each win on difficulty D advances levels[D]
--  by one (capped at 30), so the MP level board climbs with real play.

create or replace function mp.bump_level_on_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'finished' and new.winner_id is not null
     and (old.status is distinct from new.status
          or old.winner_id is distinct from new.winner_id) then
    update mp.profiles set
      levels = jsonb_set(
        coalesce(levels, '{"easy": 1, "medium": 1, "hard": 1}'::jsonb),
        array[new.difficulty],
        to_jsonb(least(30, coalesce((levels->>new.difficulty)::int, 1) + 1))
      )
    where id = new.winner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mp_rooms_bump_level on mp.rooms;
create trigger mp_rooms_bump_level
  after update on mp.rooms
  for each row execute function mp.bump_level_on_win();

-- ═══════════════ SP LEVEL-COMPLETION LEADERBOARD ═══════════════

create or replace function sp.leaderboard_by_level(p_difficulty text default 'easy')
returns table (id uuid, username text, avatar text, level int, cleared int, total int)
language sql
stable security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar, p.level,
         coalesce((p.levels->>p_difficulty)::int, 1) as cleared,
         30 as total
  from sp.profiles p
  where p.username <> 'Player'
  order by cleared desc, p.level desc, p.wins desc
  limit 20
$$;

-- ═══════════════ MP LEVEL-COMPLETION LEADERBOARD ═══════════════

create or replace function mp.leaderboard_by_level(p_difficulty text default 'easy')
returns table (id uuid, username text, avatar text, frame text, level int, cleared int, total int)
language sql
stable security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar, p.frame, p.level,
         coalesce((p.levels->>p_difficulty)::int, 1) as cleared,
         30 as total
  from mp.profiles p
  where p.games > 0
  order by cleared desc, p.level desc, p.wins desc
  limit 20
$$;

-- ═══════════════ LEVEL SHARES (opt-in "share to game leaderboards") ═══════════════
--  One row per (player, difficulty, level) — a completion is shared once.

create table if not exists sp.level_shares (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references sp.profiles(id) on delete cascade,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  level int not null check (level between 1 and 30),
  created_at timestamptz not null default now(),
  unique (player_id, difficulty, level)
);

create table if not exists mp.level_shares (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references mp.profiles(id) on delete cascade,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  level int not null check (level between 1 and 30),
  created_at timestamptz not null default now(),
  unique (player_id, difficulty, level)
);

alter table sp.level_shares enable row level security;
alter table mp.level_shares enable row level security;

drop policy if exists "sp_level_shares_select" on sp.level_shares;
create policy "sp_level_shares_select" on sp.level_shares
  for select using (true);
drop policy if exists "sp_level_shares_insert" on sp.level_shares;
create policy "sp_level_shares_insert" on sp.level_shares
  for insert to authenticated with check (player_id = (select auth.uid()));

drop policy if exists "mp_level_shares_select" on mp.level_shares;
create policy "mp_level_shares_select" on mp.level_shares
  for select using (true);
drop policy if exists "mp_level_shares_insert" on mp.level_shares
;
create policy "mp_level_shares_insert" on mp.level_shares
  for insert to authenticated with check (player_id = (select auth.uid()));

-- Server-verified share: records THIS player's completion (difficulty+level).
create or replace function sp.share_level_completion(p_difficulty text, p_level int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_difficulty not in ('easy','medium','hard') then
    raise exception 'Exotic: unknown difficulty'; end if;
  if p_level < 1 or p_level > 30 then
    raise exception 'Exotic: bad level'; end if;
  insert into sp.level_shares (player_id, difficulty, level)
  values (auth.uid(), p_difficulty, p_level)
  on conflict (player_id, difficulty, level) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function mp.share_level_completion(p_difficulty text, p_level int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if p_difficulty not in ('easy','medium','hard') then
    raise exception 'Exotic: unknown difficulty'; end if;
  if p_level < 1 or p_level > 30 then
    raise exception 'Exotic: bad level'; end if;
  insert into mp.level_shares (player_id, difficulty, level)
  values (auth.uid(), p_difficulty, p_level)
  on conflict (player_id, difficulty, level) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════ INDEXES FOR LEVEL BOARDS ═══════════════

create index if not exists mp_profiles_levels_easy_idx
  on mp.profiles ((coalesce((levels->>'easy')::int, 1)) desc);
create index if not exists mp_profiles_levels_medium_idx
  on mp.profiles ((coalesce((levels->>'medium')::int, 1)) desc);
create index if not exists mp_profiles_levels_hard_idx
  on mp.profiles ((coalesce((levels->>'hard')::int, 1)) desc);

create index if not exists sp_level_shares_player_idx on sp.level_shares (player_id);
create index if not exists mp_level_shares_player_idx on mp.level_shares (player_id);

-- ═══════════════ REALTIME: publish the new tables ═══════════════

do $$ begin alter publication supabase_realtime add table sp.level_shares; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.level_shares; exception when duplicate_object then null; end $$;
alter table sp.level_shares replica identity full;
alter table mp.level_shares replica identity full;
