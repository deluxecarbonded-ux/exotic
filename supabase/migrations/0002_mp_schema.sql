-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0002 — MULTIPLAYER schema (`mp`)
--  Tables + Row Level Security + catalog seeds.
--  Economy: ◆ Novas. Auth: email/password accounts (auth.users).
-- ═══════════════════════════════════════════════════════════════

create schema if not exists mp;
grant usage on schema mp to anon, authenticated;

-- ── profile ────────────────────────────────────────────────────
create table if not exists mp.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null default 'Agent',
  avatar      text not null default 'sparkles',
  frame       text not null default 'none',
  level       int  not null default 1,
  xp          int  not null default 0,
  novas       bigint not null default 100,
  rank_points int  not null default 1000,
  wins        int  not null default 0,
  losses      int  not null default 0,
  streak      int  not null default 0,
  best_streak int  not null default 0,
  games       int  not null default 0,
  last_daily  date,
  created_at  timestamptz not null default now()
);

-- ── rooms / match state ────────────────────────────────────────
create table if not exists mp.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid not null references mp.profiles(id) on delete cascade,
  status     text not null default 'waiting'
             check (status in ('waiting','active','finished')),
  difficulty text not null default 'easy'
             check (difficulty in ('easy','medium','hard')),
  round_no   int not null default 0,
  max_rounds int not null default 8,
  match_no   int not null default 1,
  winner_id  uuid references mp.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only vault for the secret code (RLS on, zero policies).
create table if not exists mp.secrets (
  room_id uuid primary key references mp.rooms(id) on delete cascade,
  code    text not null
);

create table if not exists mp.room_players (
  room_id      uuid not null references mp.rooms(id) on delete cascade,
  player_id    uuid not null references mp.profiles(id) on delete cascade,
  score        int not null default 0,
  ready        boolean not null default false,
  guesses_left int not null default 3,
  joined_at    timestamptz not null default now(),
  primary key (room_id, player_id)
);

-- question rows — the correct option lives in mp.answers, never here
create table if not exists mp.rounds (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references mp.rooms(id) on delete cascade,
  match_no    int  not null default 1,
  round_no    int  not null,
  category    text not null default 'mixed',
  prompt      text not null,
  options     jsonb not null,
  clue        jsonb not null default '{}',
  answered_by uuid,
  wrong_by    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (room_id, match_no, round_no)
);

create table if not exists mp.answers (
  round_id     bigint primary key references mp.rounds(id) on delete cascade,
  answer_index int not null check (answer_index between 0 and 3)
);

create table if not exists mp.guesses (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references mp.rooms(id) on delete cascade,
  match_no   int  not null default 1,
  player_id  uuid not null references mp.profiles(id) on delete cascade,
  guess      text not null,
  exact      int  not null,
  partial    int  not null,
  created_at timestamptz not null default now()
);

create table if not exists mp.chat (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references mp.rooms(id) on delete cascade,
  player_id  uuid not null references mp.profiles(id) on delete cascade,
  kind       text not null default 'text' check (kind in ('text','emote')),
  body       text not null,
  created_at timestamptz not null default now()
);

-- ── shop / inventory / ledger ──────────────────────────────────
create table if not exists mp.shop_items (
  id          text primary key,
  category    text not null check (category in ('emotes','cosmetics','frames')),
  icon        text not null,
  name        text not null,
  description text not null default '',
  price       int  not null check (price >= 0),
  effect      jsonb not null default '{}',
  available   boolean not null default true,
  featured    boolean not null default false
);

create table if not exists mp.inventory (
  id        bigint generated always as identity primary key,
  player_id uuid not null references mp.profiles(id) on delete cascade,
  item_id   text not null references mp.shop_items(id) on delete cascade,
  qty       int  not null default 1 check (qty >= 0),
  equipped  boolean not null default false,
  unique (player_id, item_id)
);

create table if not exists mp.transactions (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references mp.profiles(id) on delete cascade,
  delta      bigint not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table if not exists mp.achievements_catalog (
  id     text primary key,
  name   text not null,
  icon   text not null,
  reward int  not null default 0
);

create table if not exists mp.player_achievements (
  player_id      uuid not null references mp.profiles(id) on delete cascade,
  achievement_id text not null references mp.achievements_catalog(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

-- ═══════════════ HELPERS ═══════════════
create or replace function mp.is_member(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from mp.room_players rp
    where rp.room_id = r and rp.player_id = auth.uid()
  )
$$;

create or replace function mp.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists mp_rooms_touch on mp.rooms;
create trigger mp_rooms_touch
  before update on mp.rooms
  for each row execute function mp.touch_updated_at();

-- ═══════════════ ROW LEVEL SECURITY ═══════════════

alter table mp.profiles enable row level security;
drop policy if exists mp_profiles_select on mp.profiles;
create policy mp_profiles_select on mp.profiles
  for select to authenticated using (true);

alter table mp.rooms enable row level security;
drop policy if exists mp_rooms_select on mp.rooms;
create policy mp_rooms_select on mp.rooms
  for select to authenticated
  using (status = 'waiting' or mp.is_member(id));

alter table mp.secrets enable row level security;  -- invisible
alter table mp.answers enable row level security;  -- invisible

alter table mp.room_players enable row level security;
drop policy if exists mp_room_players_select on mp.room_players;
create policy mp_room_players_select on mp.room_players
  for select to authenticated using (
    mp.is_member(room_id)
    or exists (select 1 from mp.rooms r where r.id = room_id and r.status = 'waiting')
  );

alter table mp.rounds enable row level security;
drop policy if exists mp_rounds_select on mp.rounds;
create policy mp_rounds_select on mp.rounds
  for select to authenticated using (mp.is_member(room_id));

alter table mp.guesses enable row level security;
drop policy if exists mp_guesses_select on mp.guesses;
create policy mp_guesses_select on mp.guesses
  for select to authenticated using (mp.is_member(room_id));

alter table mp.chat enable row level security;
drop policy if exists mp_chat_select on mp.chat;
create policy mp_chat_select on mp.chat
  for select to authenticated using (mp.is_member(room_id));

alter table mp.shop_items enable row level security;
drop policy if exists mp_shop_select on mp.shop_items;
create policy mp_shop_select on mp.shop_items
  for select to authenticated using (true);

alter table mp.inventory enable row level security;
drop policy if exists mp_inventory_select on mp.inventory;
create policy mp_inventory_select on mp.inventory
  for select to authenticated using (player_id = auth.uid());

alter table mp.transactions enable row level security;
drop policy if exists mp_tx_select on mp.transactions;
create policy mp_tx_select on mp.transactions
  for select to authenticated using (player_id = auth.uid());

alter table mp.achievements_catalog enable row level security;
drop policy if exists mp_ach_cat_select on mp.achievements_catalog;
create policy mp_ach_cat_select on mp.achievements_catalog
  for select to authenticated using (true);

alter table mp.player_achievements enable row level security;
drop policy if exists mp_ach_select on mp.player_achievements;
create policy mp_ach_select on mp.player_achievements
  for select to authenticated using (player_id = auth.uid());

-- ═══════════════ GRANTS ═══════════════
grant select on
  mp.profiles, mp.rooms, mp.room_players, mp.rounds, mp.guesses, mp.chat,
  mp.shop_items, mp.inventory, mp.transactions,
  mp.achievements_catalog, mp.player_achievements
to authenticated;

-- ═══════════════ SEEDS (real catalog data, not mocks) ═════════
insert into mp.shop_items (id, category, icon, name, description, price, effect, featured) values
  ('emote-fire',   'emotes',    'flame',  'Fire Emote',    'Send 🔥 in duel chat.',                  30, '{"char":"🔥"}', true),
  ('emote-laugh',  'emotes',    'smile',  'Laugh Emote',   'Send 😂 in duel chat.',                  30, '{"char":"😂"}', false),
  ('emote-gg',     'emotes',    'medal',  'Salute Emote',  'Send 🫡 in duel chat. Respect.',         30, '{"char":"🫡"}', false),
  ('emote-heart',  'emotes',    'heart',  'Heart Emote',   'Send 🤍 in duel chat.',                  40, '{"char":"🤍"}', false),
  ('emote-shock',  'emotes',    'zap',    'Shock Emote',   'Send 🤯 in duel chat.',                  40, '{"char":"🤯"}', false),
  ('emote-crown',  'emotes',    'crown',  'Crown Emote',   'Send 👑 in duel chat. Royalty.',         60, '{"char":"👑"}', true),
  ('av-dragon',    'cosmetics', 'dragon', 'Dragon Avatar', 'Breathe fire on the leaderboard.',       180, '{"slot":"avatar"}', false),
  ('av-bot',       'cosmetics', 'bot',    'Bot Avatar',     'Beep boop. Code cracked.',              150, '{"slot":"avatar"}', false),
  ('av-skull',     'cosmetics', 'skull',  'Skull Avatar',   'For those who fear nothing.',           160, '{"slot":"avatar"}', false),
  ('av-wand',      'cosmetics', 'wand',   'Wizard Avatar',  'Digits bend to your will.',             170, '{"slot":"avatar"}', false),
  ('frame-halo',   'frames',    'star',   'Halo Ring',      'A clean ring of honor around your avatar.', 150, '{"slot":"frame","frame":"halo"}', false),
  ('frame-star',   'frames',    'star',   'Star Frame',     'A radiant frame for duel champions.',   200, '{"slot":"frame","frame":"star"}', true),
  ('frame-bolt',   'frames',    'zap',    'Bolt Frame',     'A bold offset frame. Pure voltage.',    250, '{"slot":"frame","frame":"bolt"}', false)
on conflict (id) do nothing;

insert into mp.achievements_catalog (id, name, icon, reward) values
  ('first_win', 'First Blood',   'trophy', 10),
  ('streak_3',  'On Fire',       'flame',  20),
  ('streak_5',  'Unstoppable',   'zap',    40),
  ('rank_1100', 'Climber',       'trend',  25),
  ('winner_10', 'Duel Master',   'crown',  50),
  ('social',    'Chatterbox',    'chat',   10),
  ('collector', 'Collector',     'package',25),
  ('level_5',   'Veteran',       'star',   25)
on conflict (id) do nothing;
