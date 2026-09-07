-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0001 — SINGLE PLAYER schema (`sp`)
--  Tables + Row Level Security + catalog seeds.
--  Economy: ✦ Sparks. Auth: anonymous device identity (auth.users).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create schema if not exists sp;
grant usage on schema sp to anon, authenticated;

-- ── profile (one per anonymous device account) ─────────────────
create table if not exists sp.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null default 'Player',
  avatar      text not null default 'sparkles',
  level       int  not null default 1,
  xp          int  not null default 0,
  sparks      bigint not null default 100,
  streak      int  not null default 0,
  games       int  not null default 0,
  wins        int  not null default 0,
  best_time   int,
  last_daily  date,
  created_at  timestamptz not null default now()
);

-- ── games (secret code lives in sp.secrets, never here) ────────
create table if not exists sp.games (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references sp.profiles(id) on delete cascade,
  difficulty     text not null check (difficulty in ('easy','medium','hard')),
  status         text not null default 'active'
                 check (status in ('active','won','lost','abandoned')),
  attempts_max   int not null,
  attempts_left  int not null,
  clues_max      int not null,
  clues_used     int not null default 0,
  time_limit     int not null,
  double_sparks  boolean not null default false,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration       int,
  reward         int not null default 0,
  xp_earned      int not null default 0
);
create index if not exists sp_games_player_idx on sp.games (player_id, started_at desc);

-- Server-only vault. RLS enabled + ZERO policies = invisible via API.
-- Only SECURITY DEFINER functions can read/write it.
create table if not exists sp.secrets (
  game_id uuid primary key references sp.games(id) on delete cascade,
  code    text not null
);

create table if not exists sp.guesses (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references sp.games(id) on delete cascade,
  guess      text not null,
  exact      int  not null,
  partial    int  not null,
  created_at timestamptz not null default now()
);

create table if not exists sp.clues (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references sp.games(id) on delete cascade,
  kind       text not null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── shop / inventory / ledger ──────────────────────────────────
create table if not exists sp.shop_items (
  id          text primary key,
  category    text not null check (category in ('consumables','boosters','cosmetics')),
  icon        text not null,
  name        text not null,
  description text not null default '',
  price       int  not null check (price >= 0),
  effect      jsonb not null default '{}',
  available   boolean not null default true,
  featured    boolean not null default false
);

create table if not exists sp.inventory (
  id        bigint generated always as identity primary key,
  player_id uuid not null references sp.profiles(id) on delete cascade,
  item_id   text not null references sp.shop_items(id) on delete cascade,
  qty       int  not null default 1 check (qty >= 0),
  equipped  boolean not null default false,
  unique (player_id, item_id)
);

create table if not exists sp.transactions (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references sp.profiles(id) on delete cascade,
  delta      bigint not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- ── achievements ───────────────────────────────────────────────
create table if not exists sp.achievements_catalog (
  id     text primary key,
  name   text not null,
  icon   text not null,
  reward int  not null default 0
);

create table if not exists sp.player_achievements (
  player_id      uuid not null references sp.profiles(id) on delete cascade,
  achievement_id text not null references sp.achievements_catalog(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

-- ═══════════════ ROW LEVEL SECURITY ═══════════════
-- All economy writes happen exclusively through SECURITY DEFINER RPCs.

alter table sp.profiles enable row level security;
drop policy if exists sp_profiles_select on sp.profiles;
create policy sp_profiles_select on sp.profiles
  for select to authenticated using (true);

alter table sp.games enable row level security;
drop policy if exists sp_games_select on sp.games;
create policy sp_games_select on sp.games
  for select to authenticated using (player_id = auth.uid());

alter table sp.secrets enable row level security; -- no policies on purpose

alter table sp.guesses enable row level security;
drop policy if exists sp_guesses_select on sp.guesses;
create policy sp_guesses_select on sp.guesses
  for select to authenticated using (
    exists (select 1 from sp.games g where g.id = game_id and g.player_id = auth.uid())
  );

alter table sp.clues enable row level security;
drop policy if exists sp_clues_select on sp.clues;
create policy sp_clues_select on sp.clues
  for select to authenticated using (
    exists (select 1 from sp.games g where g.id = game_id and g.player_id = auth.uid())
  );

alter table sp.shop_items enable row level security;
drop policy if exists sp_shop_select on sp.shop_items;
create policy sp_shop_select on sp.shop_items
  for select to authenticated using (true);

alter table sp.inventory enable row level security;
drop policy if exists sp_inventory_select on sp.inventory;
create policy sp_inventory_select on sp.inventory
  for select to authenticated using (player_id = auth.uid());

alter table sp.transactions enable row level security;
drop policy if exists sp_tx_select on sp.transactions;
create policy sp_tx_select on sp.transactions
  for select to authenticated using (player_id = auth.uid());

alter table sp.achievements_catalog enable row level security;
drop policy if exists sp_ach_cat_select on sp.achievements_catalog;
create policy sp_ach_cat_select on sp.achievements_catalog
  for select to authenticated using (true);

alter table sp.player_achievements enable row level security;
drop policy if exists sp_ach_select on sp.player_achievements;
create policy sp_ach_select on sp.player_achievements
  for select to authenticated using (player_id = auth.uid());

-- ═══════════════ GRANTS ═══════════════
grant select on
  sp.profiles, sp.games, sp.guesses, sp.clues, sp.shop_items,
  sp.inventory, sp.transactions, sp.achievements_catalog, sp.player_achievements
to authenticated;

-- ═══════════════ SEEDS (real catalog data, not mocks) ═════════
insert into sp.shop_items (id, category, icon, name, description, price, effect, featured) values
  ('reveal',      'consumables', 'eye',       'Digit Lens',   'Instantly reveals one digit and its exact position.', 60,  '{}', true),
  ('extra-guess', 'consumables', 'key',       'Spare Key',    'Grants one extra code guess for the current run.',    50,  '{}', false),
  ('time-freeze', 'consumables', 'snowflake', 'Chrono Shard', 'Adds 60 seconds to the current run timer.',           45,  '{}', false),
  ('oracle',      'consumables', 'brain',     'The Oracle',   'Ask the AI Oracle one mystical, strategy-only hint.', 80,  '{}', true),
  ('double',      'boosters',    'zap',       'Nova Boost',   'Doubles the Sparks earned on your next solo run.',     90,  '{}', false),
  ('av-squirrel', 'cosmetics',   'squirrel',  'Squirrel Avatar','A cunning vault companion.',                        120, '{"slot":"avatar"}', false),
  ('av-ghost',    'cosmetics',   'ghost',     'Ghost Avatar', 'Silent. Unseen. Unstoppable.',                        120, '{"slot":"avatar"}', false),
  ('av-cat',      'cosmetics',   'cat',       'Cat Avatar',   'Nine lives, four digits.',                            120, '{"slot":"avatar"}', false),
  ('av-rocket',   'cosmetics',   'rocket',    'Rocket Avatar','For players who crack codes at escape velocity.',     150, '{"slot":"avatar"}', false),
  ('av-comet',    'cosmetics',   'comet',     'Comet Avatar', 'It definitely knows something about the code.',       180, '{"slot":"avatar"}', true),
  ('av-crown',    'cosmetics',   'crown',     'Crown Avatar', 'Royalty of the vault.',                               200, '{"slot":"avatar"}', false)
on conflict (id) do nothing;

insert into sp.achievements_catalog (id, name, icon, reward) values
  ('first_win', 'First Crack',     'trophy', 10),
  ('streak_3',  'Hat Trick',       'flame',  20),
  ('streak_5',  'Unstoppable',     'zap',    40),
  ('speed_60',  'Lightning',       'timer',  30),
  ('ghost',     'Ghost Protocol',  'gem',    30),
  ('first_buy', 'Retail Therapy',  'gift',   10),
  ('level_5',   'Rising Star',     'star',   25),
  ('rich_500',  'Spark Baron',     'crown',  50)
on conflict (id) do nothing;
