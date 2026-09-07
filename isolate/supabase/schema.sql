-- ═══════════════════════════════════════════════════════════════════
--  EXOTIC · COMPLETE SUPABASE SCHEMA (consolidated live snapshot)
--  Generated from the production database by tools/gen-schema.mjs.
--  Migrations 0001–0016 are the authoritative history; this file is
--  the full current state: schemas · tables (columns/PK/unique/checks)
--  · indexes · RLS policies · functions (RPCs) · triggers · seed data ·
--  realtime publication · edge-function reference.
--
--  Edge Functions (deployed via CLI, source in supabase/functions/):
--    · ai            — typed-question generation + oracle (mirrors /api/ai)
--    · rotate-shop   — daily featured-item rotation
--    · cleanup-rooms — stale room reaper
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create schema if not exists sp;
create schema if not exists mp;

-- ── table mp.achievements_catalog ──
CREATE TABLE mp.achievements_catalog (
  id text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL,
  reward integer NOT NULL DEFAULT 0,
  CONSTRAINT achievements_catalog_pkey PRIMARY KEY (id)
);
-- ── table mp.answers ──
CREATE TABLE mp.answers (
  round_id bigint NOT NULL,
  answer_index integer,
  answer_text text,
  CONSTRAINT answers_answer_index_check CHECK (((answer_index >= 0) AND (answer_index <= 3))),
  CONSTRAINT answers_round_id_fkey FOREIGN KEY (round_id) REFERENCES mp.rounds(id) ON DELETE CASCADE,
  CONSTRAINT answers_pkey PRIMARY KEY (round_id)
);
-- ── table mp.chat ──
CREATE TABLE mp.chat (
  id bigint NOT NULL,
  room_id uuid NOT NULL,
  player_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'text'::text,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'emote'::text]))),
  CONSTRAINT chat_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT chat_room_id_fkey FOREIGN KEY (room_id) REFERENCES mp.rooms(id) ON DELETE CASCADE,
  CONSTRAINT chat_pkey PRIMARY KEY (id)
);
-- ── table mp.inventory ──
CREATE TABLE mp.inventory (
  id bigint NOT NULL,
  player_id uuid NOT NULL,
  item_id text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false,
  CONSTRAINT inventory_qty_check CHECK ((qty >= 0)),
  CONSTRAINT inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES mp.shop_items(id) ON DELETE CASCADE,
  CONSTRAINT inventory_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT inventory_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_player_id_item_id_key UNIQUE (player_id, item_id)
);
-- ── table mp.level_shares ──
CREATE TABLE mp.level_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  difficulty text NOT NULL,
  level integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT level_shares_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
  CONSTRAINT level_shares_level_check CHECK (((level >= 1) AND (level <= 30))),
  CONSTRAINT level_shares_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT level_shares_pkey PRIMARY KEY (id),
  CONSTRAINT level_shares_player_id_difficulty_level_key UNIQUE (player_id, difficulty, level)
);
-- ── table mp.player_achievements ──
CREATE TABLE mp.player_achievements (
  player_id uuid NOT NULL,
  achievement_id text NOT NULL,
  unlocked_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES mp.achievements_catalog(id) ON DELETE CASCADE,
  CONSTRAINT player_achievements_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT player_achievements_pkey PRIMARY KEY (player_id, achievement_id)
);
-- ── table mp.profiles ──
CREATE TABLE mp.profiles (
  id uuid NOT NULL,
  username text NOT NULL DEFAULT 'Agent'::text,
  avatar text NOT NULL DEFAULT 'sparkles'::text,
  frame text NOT NULL DEFAULT 'none'::text,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  novas bigint NOT NULL DEFAULT 100,
  rank_points integer NOT NULL DEFAULT 1000,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  last_daily date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email_verified boolean NOT NULL DEFAULT true,
  levels jsonb NOT NULL DEFAULT '{"easy": 1, "hard": 1, "medium": 1}'::jsonb,
  CONSTRAINT mp_profiles_user_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
-- ── table mp.room_players ──
CREATE TABLE mp.room_players (
  room_id uuid NOT NULL,
  player_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  ready boolean NOT NULL DEFAULT false,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT room_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT room_players_room_id_fkey FOREIGN KEY (room_id) REFERENCES mp.rooms(id) ON DELETE CASCADE,
  CONSTRAINT room_players_pkey PRIMARY KEY (room_id, player_id)
);
-- ── table mp.rooms ──
CREATE TABLE mp.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  host_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting'::text,
  difficulty text NOT NULL DEFAULT 'easy'::text,
  round_no integer NOT NULL DEFAULT 0,
  max_rounds integer NOT NULL DEFAULT 8,
  match_no integer NOT NULL DEFAULT 1,
  winner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rooms_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
  CONSTRAINT rooms_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'active'::text, 'finished'::text]))),
  CONSTRAINT rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT rooms_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES mp.profiles(id),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_code_key UNIQUE (code)
);
-- ── table mp.rounds ──
CREATE TABLE mp.rounds (
  id bigint NOT NULL,
  room_id uuid NOT NULL,
  match_no integer NOT NULL DEFAULT 1,
  round_no integer NOT NULL,
  category text NOT NULL DEFAULT 'mixed'::text,
  prompt text NOT NULL,
  options jsonb,
  answered_by uuid,
  wrong_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  answer_kind text NOT NULL DEFAULT 'word'::text,
  answer_len integer NOT NULL DEFAULT 0,
  CONSTRAINT rounds_answer_kind_check CHECK ((answer_kind = ANY (ARRAY['word'::text, 'number'::text]))),
  CONSTRAINT rounds_room_id_fkey FOREIGN KEY (room_id) REFERENCES mp.rooms(id) ON DELETE CASCADE,
  CONSTRAINT rounds_pkey PRIMARY KEY (id),
  CONSTRAINT rounds_room_id_match_no_round_no_key UNIQUE (room_id, match_no, round_no)
);
-- ── table mp.shop_items ──
CREATE TABLE mp.shop_items (
  id text NOT NULL,
  category text NOT NULL,
  icon text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  price integer NOT NULL,
  effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  available boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  CONSTRAINT shop_items_category_check CHECK ((category = ANY (ARRAY['emotes'::text, 'cosmetics'::text, 'frames'::text, 'consumables'::text]))),
  CONSTRAINT shop_items_price_check CHECK ((price >= 0)),
  CONSTRAINT shop_items_pkey PRIMARY KEY (id)
);
-- ── table mp.transactions ──
CREATE TABLE mp.transactions (
  id bigint NOT NULL,
  player_id uuid NOT NULL,
  delta bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transactions_player_id_fkey FOREIGN KEY (player_id) REFERENCES mp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);
-- ── table public.answer_groups ──
CREATE TABLE public.answer_groups (
  grp text NOT NULL,
  lang text NOT NULL,
  answer text NOT NULL,
  CONSTRAINT answer_groups_pk PRIMARY KEY (grp, lang)
);
-- ── table public.email_tokens ──
CREATE TABLE public.email_tokens (
  id bigint NOT NULL,
  user_id uuid NOT NULL,
  mode text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_tokens_mode_check CHECK ((mode = ANY (ARRAY['sp'::text, 'mp'::text]))),
  CONSTRAINT email_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT email_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT email_tokens_token_hash_key UNIQUE (token_hash)
);
-- ── table sp.achievements_catalog ──
CREATE TABLE sp.achievements_catalog (
  id text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL,
  reward integer NOT NULL DEFAULT 0,
  CONSTRAINT achievements_catalog_pkey PRIMARY KEY (id)
);
-- ── table sp.clues ──
CREATE TABLE sp.clues (
  id bigint NOT NULL,
  game_id uuid NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clues_game_id_fkey FOREIGN KEY (game_id) REFERENCES sp.games(id) ON DELETE CASCADE,
  CONSTRAINT clues_pkey PRIMARY KEY (id)
);
-- ── table sp.games ──
CREATE TABLE sp.games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  difficulty text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  clues_used integer NOT NULL DEFAULT 0,
  time_limit integer NOT NULL,
  double_sparks boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  duration integer,
  reward integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  CONSTRAINT games_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
  CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['active'::text, 'won'::text, 'lost'::text, 'abandoned'::text]))),
  CONSTRAINT games_player_id_fkey FOREIGN KEY (player_id) REFERENCES sp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT games_pkey PRIMARY KEY (id)
);
-- ── table sp.inventory ──
CREATE TABLE sp.inventory (
  id bigint NOT NULL,
  player_id uuid NOT NULL,
  item_id text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false,
  CONSTRAINT inventory_qty_check CHECK ((qty >= 0)),
  CONSTRAINT inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES sp.shop_items(id) ON DELETE CASCADE,
  CONSTRAINT inventory_player_id_fkey FOREIGN KEY (player_id) REFERENCES sp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT inventory_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_player_id_item_id_key UNIQUE (player_id, item_id)
);
-- ── table sp.level_shares ──
CREATE TABLE sp.level_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  difficulty text NOT NULL,
  level integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT level_shares_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
  CONSTRAINT level_shares_level_check CHECK (((level >= 1) AND (level <= 30))),
  CONSTRAINT level_shares_player_id_fkey FOREIGN KEY (player_id) REFERENCES sp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT level_shares_pkey PRIMARY KEY (id),
  CONSTRAINT level_shares_player_id_difficulty_level_key UNIQUE (player_id, difficulty, level)
);
-- ── table sp.player_achievements ──
CREATE TABLE sp.player_achievements (
  player_id uuid NOT NULL,
  achievement_id text NOT NULL,
  unlocked_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES sp.achievements_catalog(id) ON DELETE CASCADE,
  CONSTRAINT player_achievements_player_id_fkey FOREIGN KEY (player_id) REFERENCES sp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT player_achievements_pkey PRIMARY KEY (player_id, achievement_id)
);
-- ── table sp.profiles ──
CREATE TABLE sp.profiles (
  id uuid NOT NULL,
  username text NOT NULL DEFAULT 'Player'::text,
  avatar text NOT NULL DEFAULT 'sparkles'::text,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  sparks bigint NOT NULL DEFAULT 100,
  streak integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  best_time integer,
  last_daily date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  levels jsonb NOT NULL DEFAULT '{"easy": 1, "hard": 1, "medium": 1}'::jsonb,
  email_verified boolean NOT NULL DEFAULT true,
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT sp_profiles_user_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
-- ── table sp.questions ──
CREATE TABLE sp.questions (
  game_id uuid NOT NULL,
  prompt text NOT NULL,
  answer_kind text NOT NULL,
  answer_len integer NOT NULL DEFAULT 0,
  answer_text text NOT NULL,
  category text NOT NULL DEFAULT 'mixed'::text,
  tries integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT questions_answer_kind_check CHECK ((answer_kind = ANY (ARRAY['word'::text, 'number'::text]))),
  CONSTRAINT questions_game_id_fkey FOREIGN KEY (game_id) REFERENCES sp.games(id) ON DELETE CASCADE,
  CONSTRAINT questions_pkey PRIMARY KEY (game_id)
);
-- ── table sp.shop_items ──
CREATE TABLE sp.shop_items (
  id text NOT NULL,
  category text NOT NULL,
  icon text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  price integer NOT NULL,
  effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  available boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  CONSTRAINT shop_items_category_check CHECK ((category = ANY (ARRAY['consumables'::text, 'boosters'::text, 'cosmetics'::text]))),
  CONSTRAINT shop_items_price_check CHECK ((price >= 0)),
  CONSTRAINT shop_items_pkey PRIMARY KEY (id)
);
-- ── table sp.transactions ──
CREATE TABLE sp.transactions (
  id bigint NOT NULL,
  player_id uuid NOT NULL,
  delta bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transactions_player_id_fkey FOREIGN KEY (player_id) REFERENCES sp.profiles(id) ON DELETE CASCADE,
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);
-- ═══════════════════════════════ INDEXES ═══════════════════════════════
CREATE UNIQUE INDEX inventory_player_id_item_id_key ON mp.inventory USING btree (player_id, item_id);
CREATE UNIQUE INDEX level_shares_player_id_difficulty_level_key ON mp.level_shares USING btree (player_id, difficulty, level);
CREATE INDEX mp_level_shares_player_idx ON mp.level_shares USING btree (player_id);
CREATE INDEX mp_profiles_level_idx ON mp.profiles USING btree (level DESC);
CREATE INDEX mp_profiles_levels_easy_idx ON mp.profiles USING btree (COALESCE(((levels ->> 'easy'::text))::integer, 1) DESC);
CREATE INDEX mp_profiles_levels_hard_idx ON mp.profiles USING btree (COALESCE(((levels ->> 'hard'::text))::integer, 1) DESC);
CREATE INDEX mp_profiles_levels_idx ON mp.profiles USING gin (levels);
CREATE INDEX mp_profiles_levels_medium_idx ON mp.profiles USING btree (COALESCE(((levels ->> 'medium'::text))::integer, 1) DESC);
CREATE INDEX mp_profiles_novas_idx ON mp.profiles USING btree (novas DESC);
CREATE INDEX mp_profiles_rank_idx ON mp.profiles USING btree (rank_points DESC);
CREATE INDEX mp_profiles_streak_idx ON mp.profiles USING btree (best_streak DESC);
CREATE INDEX mp_profiles_wins_idx ON mp.profiles USING btree (wins DESC);
CREATE UNIQUE INDEX rooms_code_key ON mp.rooms USING btree (code);
CREATE UNIQUE INDEX rounds_room_id_match_no_round_no_key ON mp.rounds USING btree (room_id, match_no, round_no);
CREATE UNIQUE INDEX inventory_player_id_item_id_key ON sp.inventory USING btree (player_id, item_id);
CREATE UNIQUE INDEX level_shares_player_id_difficulty_level_key ON sp.level_shares USING btree (player_id, difficulty, level);
CREATE INDEX sp_games_player_idx ON sp.games USING btree (player_id, started_at DESC);
CREATE INDEX sp_level_shares_player_idx ON sp.level_shares USING btree (player_id);
CREATE INDEX sp_profiles_level_idx ON sp.profiles USING btree (level DESC);
CREATE INDEX sp_profiles_sparks_idx ON sp.profiles USING btree (sparks DESC);
CREATE INDEX sp_profiles_streak_idx ON sp.profiles USING btree (streak DESC);
CREATE INDEX sp_profiles_time_idx ON sp.profiles USING btree (best_time);
CREATE INDEX sp_profiles_wins_idx ON sp.profiles USING btree (wins DESC);

-- ═══════════════════════════════ RLS ═══════════════════════════════
ALTER TABLE mp.achievements_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.level_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.achievements_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.clues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.level_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_ach_cat_select ON mp.achievements_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY mp_chat_select ON mp.chat FOR SELECT TO authenticated USING (mp.is_member(room_id));
CREATE POLICY mp_inventory_select ON mp.inventory FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY mp_level_shares_insert ON mp.level_shares FOR INSERT TO authenticated WITH CHECK ((player_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY mp_level_shares_select ON mp.level_shares FOR SELECT TO public USING (true);
CREATE POLICY mp_ach_select ON mp.player_achievements FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY mp_profiles_select ON mp.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY mp_room_players_select ON mp.room_players FOR SELECT TO authenticated USING ((mp.is_member(room_id) OR (EXISTS ( SELECT 1
   FROM mp.rooms r
  WHERE ((r.id = room_players.room_id) AND (r.status = 'waiting'::text))))));
CREATE POLICY mp_rooms_select ON mp.rooms FOR SELECT TO authenticated USING (((status = 'waiting'::text) OR mp.is_member(id)));
CREATE POLICY mp_rounds_select ON mp.rounds FOR SELECT TO authenticated USING (mp.is_member(room_id));
CREATE POLICY mp_shop_select ON mp.shop_items FOR SELECT TO authenticated USING (true);
CREATE POLICY mp_tx_select ON mp.transactions FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY sp_ach_cat_select ON sp.achievements_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_clues_select ON sp.clues FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM sp.games g
  WHERE ((g.id = clues.game_id) AND (g.player_id = auth.uid())))));
CREATE POLICY sp_games_select ON sp.games FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY sp_inventory_select ON sp.inventory FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY sp_level_shares_insert ON sp.level_shares FOR INSERT TO authenticated WITH CHECK ((player_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY sp_level_shares_select ON sp.level_shares FOR SELECT TO public USING (true);
CREATE POLICY sp_ach_select ON sp.player_achievements FOR SELECT TO authenticated USING ((player_id = auth.uid()));
CREATE POLICY sp_profiles_select ON sp.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_shop_select ON sp.shop_items FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_tx_select ON sp.transactions FOR SELECT TO authenticated USING ((player_id = auth.uid()));

-- ═══════════════════════════════ FUNCTIONS (RPCs) ═══════════════════════════════

-- mp.achs_profile_trg
CREATE OR REPLACE FUNCTION mp.achs_profile_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform mp.check_achs(new.id);
  return null;
end $function$
;

-- mp.answer_round
CREATE OR REPLACE FUNCTION mp.answer_round(p_room uuid, p_round bigint, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if (given = ans or public.same_answer_group(given, ans, rd.answer_kind)) and char_length(given) > 0 then
    update mp.rounds set answered_by = auth.uid() where id = p_round;
    update mp.room_players set score = score + 1
    where room_id = p_room and player_id = auth.uid();
    return jsonb_build_object('correct', true);
  end if;

  update mp.rounds set wrong_by = array_append(wrong_by, auth.uid()) where id = p_round;
  return jsonb_build_object('correct', false);
end $function$
;

-- mp.award
CREATE OR REPLACE FUNCTION mp.award(p_id text, p_user uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.bump_level_on_win
CREATE OR REPLACE FUNCTION mp.bump_level_on_win()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- mp.buy_item
CREATE OR REPLACE FUNCTION mp.buy_item(p_item text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.check_achs
CREATE OR REPLACE FUNCTION mp.check_achs(p_user uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.claim_daily
CREATE OR REPLACE FUNCTION mp.claim_daily()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p mp.profiles; amount int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into p from mp.profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'Exotic: no multiplayer profile for this account'; end if;
  if p.last_daily = current_date then raise exception 'Exotic: already claimed today'; end if;
  amount := least(80, 20 + p.level * 4);
  update mp.profiles set novas = novas + amount, last_daily = current_date
  where id = auth.uid();
  insert into mp.transactions (player_id, delta, reason)
  values (auth.uid(), amount, 'daily');
  return jsonb_build_object('ok', true, 'amount', amount);
end $function$
;

-- mp.create_room
CREATE OR REPLACE FUNCTION mp.create_room(p_difficulty text DEFAULT 'easy'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not exists(select 1 from mp.profiles where id = auth.uid()) then
    raise exception 'Exotic: create a duel account first'; end if;
  if not coalesce((select email_verified from mp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
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
end $function$
;

-- mp.create_round
CREATE OR REPLACE FUNCTION mp.create_round(p_room uuid, p_category text, p_prompt text, p_kind text, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- mp.end_match
CREATE OR REPLACE FUNCTION mp.end_match(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- mp.equip_item
CREATE OR REPLACE FUNCTION mp.equip_item(p_item text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.finish_draw
CREATE OR REPLACE FUNCTION mp.finish_draw(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update mp.rooms set status = 'finished', winner_id = null
  where id = p_room and status = 'active';
  update mp.profiles set novas = novas + 10, games = games + 1, xp = xp + 10
  where id in (select player_id from mp.room_players where room_id = p_room);
  insert into mp.transactions (player_id, delta, reason)
  select player_id, 10, 'duel-draw:' || p_room
  from mp.room_players where room_id = p_room;
end $function$
;

-- mp.gen_room_code
CREATE OR REPLACE FUNCTION mp.gen_room_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
begin
  for i in 1..5 loop
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out;
end $function$
;

-- mp.is_member
CREATE OR REPLACE FUNCTION mp.is_member(r uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from mp.room_players rp
    where rp.room_id = r and rp.player_id = auth.uid()
  )
$function$
;

-- mp.join_room
CREATE OR REPLACE FUNCTION mp.join_room(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r mp.rooms;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not coalesce((select email_verified from mp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
  select * into r from mp.rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Exotic: room not found'; end if;
  if r.status <> 'waiting' then raise exception 'Exotic: that duel already started'; end if;
  if exists(select 1 from mp.room_players
            where room_id = r.id and player_id = auth.uid()) then
    return jsonb_build_object('id', r.id, 'code', r.code);
  end if;
  if (select count(*) from mp.room_players where room_id = r.id) >= 2 then
    raise exception 'Exotic: room is full';
  end if;

  insert into mp.room_players (room_id, player_id) values (r.id, auth.uid());
  return jsonb_build_object('id', r.id, 'code', r.code);
end $function$
;

-- mp.leaderboard
CREATE OR REPLACE FUNCTION mp.leaderboard(p_kind text DEFAULT 'rank'::text)
 RETURNS TABLE(id uuid, username text, avatar text, frame text, level integer, value bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- mp.leaderboard_by_level
CREATE OR REPLACE FUNCTION mp.leaderboard_by_level(p_difficulty text DEFAULT 'easy'::text)
 RETURNS TABLE(id uuid, username text, avatar text, frame text, level integer, cleared integer, total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.username, p.avatar, p.frame, p.level,
         coalesce((p.levels->>p_difficulty)::int, 1) as cleared,
         30 as total
  from mp.profiles p
  where p.games > 0
  order by cleared desc, p.level desc, p.wins desc
  limit 20
$function$
;

-- mp.leave_room
CREATE OR REPLACE FUNCTION mp.leave_room(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.my_room
CREATE OR REPLACE FUNCTION mp.my_room()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status)
  from mp.rooms r
  join mp.room_players rp on rp.room_id = r.id
  where rp.player_id = auth.uid() and r.status in ('waiting','active')
  order by r.updated_at desc
  limit 1
$function$
;

-- mp.norm_answer
CREATE OR REPLACE FUNCTION mp.norm_answer(v text, kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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

-- mp.register_profile
CREATE OR REPLACE FUNCTION mp.register_profile(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mp', 'public'
AS $function$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from mp.profiles where id = uid) then
    return jsonb_build_object('ok', true, 'exists', true);
  end if;
  uname := left(btrim(coalesce(p_username, '')), 16);
  if length(uname) < 2 then return jsonb_build_object('ok', false, 'error', 'username'); end if;
  insert into mp.profiles (id, username) values (uid, uname);
  return jsonb_build_object('ok', true, 'created', true);
end $function$
;

-- mp.rematch
CREATE OR REPLACE FUNCTION mp.rematch(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- mp.rename
CREATE OR REPLACE FUNCTION mp.rename(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if char_length(trim(p_username)) < 2 or char_length(trim(p_username)) > 16 then
    raise exception 'Exotic: name must be 2–16 characters'; end if;
  update mp.profiles set username = trim(p_username) where id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$
;

-- mp.send_chat
CREATE OR REPLACE FUNCTION mp.send_chat(p_room uuid, p_kind text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.set_avatar
CREATE OR REPLACE FUNCTION mp.set_avatar(p_icon text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update mp.profiles set avatar = p_icon where id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$
;

-- mp.set_frame
CREATE OR REPLACE FUNCTION mp.set_frame(p_frame text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- mp.set_ready
CREATE OR REPLACE FUNCTION mp.set_ready(p_room uuid, p_ready boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update mp.room_players set ready = p_ready
  where room_id = p_room and player_id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$
;

-- mp.share_level_completion
CREATE OR REPLACE FUNCTION mp.share_level_completion(p_difficulty text, p_level integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- mp.start_match
CREATE OR REPLACE FUNCTION mp.start_match(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- mp.sync_level
CREATE OR REPLACE FUNCTION mp.sync_level(uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare lvl int; x int;
begin
  select level, xp into lvl, x from mp.profiles where id = uid;
  while x >= lvl * 100 loop lvl := lvl + 1; end loop;
  update mp.profiles set level = lvl where id = uid;
end $function$
;

-- mp.touch_updated_at
CREATE OR REPLACE FUNCTION mp.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

-- mp.use_item
CREATE OR REPLACE FUNCTION mp.use_item(p_item text, p_room uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- sp.abandon_game
CREATE OR REPLACE FUNCTION sp.abandon_game(p_game uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update sp.games set status = 'abandoned', finished_at = now()
  where id = p_game and player_id = auth.uid() and status = 'active';
  return jsonb_build_object('ok', true);
end $function$
;

-- sp.achs_game_trg
CREATE OR REPLACE FUNCTION sp.achs_game_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform sp.check_achs(coalesce(new.player_id, auth.uid()), new.id);
  return null;
end $function$
;

-- sp.achs_profile_trg
CREATE OR REPLACE FUNCTION sp.achs_profile_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform sp.check_achs(new.id);
  return null;
end $function$
;

-- sp.award
CREATE OR REPLACE FUNCTION sp.award(p_id text, p_user uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- sp.buy_item
CREATE OR REPLACE FUNCTION sp.buy_item(p_item text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- sp.check_achs
CREATE OR REPLACE FUNCTION sp.check_achs(p_user uuid DEFAULT NULL::uuid, p_game uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- sp.claim_daily
CREATE OR REPLACE FUNCTION sp.claim_daily()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p sp.profiles; amount int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  select * into p from sp.profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'Exotic: no single-player profile for this account'; end if;
  if p.last_daily = current_date then raise exception 'Exotic: already claimed today'; end if;
  amount := least(100, 25 + p.level * 5);
  update sp.profiles set sparks = sparks + amount, last_daily = current_date
  where id = auth.uid();
  insert into sp.transactions (player_id, delta, reason)
  values (auth.uid(), amount, 'daily');
  return jsonb_build_object('ok', true, 'amount', amount);
end $function$
;

-- sp.equip_item
CREATE OR REPLACE FUNCTION sp.equip_item(p_item text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

-- sp.leaderboard
CREATE OR REPLACE FUNCTION sp.leaderboard(p_kind text DEFAULT 'wins'::text)
 RETURNS TABLE(id uuid, username text, avatar text, level integer, value bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- sp.leaderboard_by_level
CREATE OR REPLACE FUNCTION sp.leaderboard_by_level(p_difficulty text DEFAULT 'easy'::text)
 RETURNS TABLE(id uuid, username text, avatar text, level integer, cleared integer, total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.username, p.avatar, p.level,
         coalesce((p.levels->>p_difficulty)::int, 1) as cleared,
         30 as total
  from sp.profiles p
  where p.username <> 'Player'
  order by cleared desc, p.level desc, p.wins desc
  limit 20
$function$
;

-- sp.norm_answer
CREATE OR REPLACE FUNCTION sp.norm_answer(v text, kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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

-- sp.register_profile
CREATE OR REPLACE FUNCTION sp.register_profile(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sp', 'public'
AS $function$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'Exotic: sign in first'; end if;
  if exists (select 1 from sp.profiles where id = uid) then
    return jsonb_build_object('ok', true, 'exists', true);
  end if;
  uname := left(btrim(coalesce(p_username, '')), 16);
  if length(uname) < 2 then return jsonb_build_object('ok', false, 'error', 'username'); end if;
  insert into sp.profiles (id, username) values (uid, uname);
  return jsonb_build_object('ok', true, 'created', true);
end $function$
;

-- sp.rename
CREATE OR REPLACE FUNCTION sp.rename(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if char_length(trim(p_username)) < 2 or char_length(trim(p_username)) > 16 then
    raise exception 'Exotic: name must be 2–16 characters'; end if;
  update sp.profiles set username = trim(p_username) where id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$
;

-- sp.set_avatar
CREATE OR REPLACE FUNCTION sp.set_avatar(p_icon text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  update sp.profiles set avatar = p_icon where id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$
;

-- sp.set_question
CREATE OR REPLACE FUNCTION sp.set_question(p_game uuid, p_prompt text, p_answer text, p_kind text, p_category text DEFAULT 'mixed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- sp.share_level_completion
CREATE OR REPLACE FUNCTION sp.share_level_completion(p_difficulty text, p_level integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- sp.start_game
CREATE OR REPLACE FUNCTION sp.start_game(p_difficulty text, p_double boolean DEFAULT false, p_level integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid; tl int; lvl int; n int; dbl boolean := coalesce(p_double, false); base_tl int;
begin
  if auth.uid() is null then raise exception 'Exotic: sign in first'; end if;
  if not coalesce((select email_verified from sp.profiles where id = auth.uid()), false) then
    raise exception 'Exotic: confirm your email first';
  end if;
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

-- sp.submit_answer
CREATE OR REPLACE FUNCTION sp.submit_answer(p_game uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if coalesce(given, '') = '' or (given <> qa.answer_text and not public.same_answer_group(given, qa.answer_text, qa.answer_kind)) then
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

-- sp.time_out
CREATE OR REPLACE FUNCTION sp.time_out(p_game uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- sp.use_item
CREATE OR REPLACE FUNCTION sp.use_item(p_item text, p_game uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- public helpers

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m text;
begin
  m := lower(coalesce(new.raw_user_meta_data->>'mode', ''));
  if new.email is null then
    -- legacy device vault (anonymous) → single player only
    insert into sp.profiles (id) values (new.id) on conflict (id) do nothing;
  elsif m = 'mp' then
    -- Duel signup → Duel profile ONLY (Solo self-registers on entry)
    insert into mp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Agent'))
    on conflict (id) do nothing;
  else
    -- Solo signup (or manual/dashboard creation) → Solo profile ONLY
    insert into sp.profiles (id, username)
    values (new.id,
            coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''), 'Player'))
    on conflict (id) do nothing;
  end if;
  return new;
end $function$
;

-- ═══════════════════════════════ TRIGGERS ═══════════════════════════════
CREATE TRIGGER mp_achs_profile AFTER UPDATE ON mp.profiles FOR EACH ROW EXECUTE FUNCTION mp.achs_profile_trg();
CREATE TRIGGER mp_rooms_bump_level AFTER UPDATE ON mp.rooms FOR EACH ROW EXECUTE FUNCTION mp.bump_level_on_win();
CREATE TRIGGER mp_rooms_touch BEFORE UPDATE ON mp.rooms FOR EACH ROW EXECUTE FUNCTION mp.touch_updated_at();
CREATE TRIGGER sp_achs_game AFTER UPDATE OF status ON sp.games FOR EACH ROW WHEN (((old.status = 'active'::text) AND (new.status = ANY (ARRAY['won'::text, 'lost'::text])))) EXECUTE FUNCTION sp.achs_game_trg();
CREATE TRIGGER sp_achs_profile AFTER UPDATE ON sp.profiles FOR EACH ROW EXECUTE FUNCTION sp.achs_profile_trg();

-- ═══════════════════════════════ SEED DATA ═══════════════════════════════

INSERT INTO mp.achievements_catalog (id, name, icon, reward) VALUES
  ('collector', 'Collector', 'package', 25),
  ('first_win', 'First Blood', 'trophy', 10),
  ('games_25', 'Regular', 'timer', 40),
  ('level_10', 'Champion', 'star', 80),
  ('level_5', 'Veteran', 'star', 25),
  ('novas_500', 'Nova Bank', 'gem', 60),
  ('rank_1100', 'Climber', 'trend', 25),
  ('rank_1300', 'Silver Tongue', 'trend', 50),
  ('rank_1500', 'Gold Standard', 'medal', 80),
  ('social', 'Chatterbox', 'chat', 10),
  ('streak_3', 'On Fire', 'flame', 20),
  ('streak_5', 'Unstoppable', 'zap', 40),
  ('winner_10', 'Duel Master', 'crown', 50),
  ('winner_25', 'Duel Legend', 'crown', 100)
ON CONFLICT DO NOTHING;

INSERT INTO mp.shop_items (id, category, icon, name, description, price, effect, available, featured) VALUES
  ('av-bot', 'cosmetics', 'bot', 'Bot Avatar', 'Beep boop. Code cracked.', 150, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-dragon', 'cosmetics', 'dragon', 'Dragon Avatar', 'Breathe fire on the leaderboard.', 180, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-skull', 'cosmetics', 'skull', 'Skull Avatar', 'For those who fear nothing.', 160, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-wand', 'cosmetics', 'wand', 'Wizard Avatar', 'Digits bend to your will.', 170, '{"slot":"avatar"}'::jsonb, true, false),
  ('emote-crown', 'emotes', 'crown', 'Crown Emote', 'Send 👑 in duel chat. Royalty.', 60, '{"char":"👑"}'::jsonb, true, true),
  ('emote-fire', 'emotes', 'flame', 'Fire Emote', 'Send 🔥 in duel chat.', 30, '{"char":"🔥"}'::jsonb, true, true),
  ('emote-gg', 'emotes', 'medal', 'Salute Emote', 'Send 🫡 in duel chat. Respect.', 30, '{"char":"🫡"}'::jsonb, true, false),
  ('emote-heart', 'emotes', 'heart', 'Heart Emote', 'Send 🤍 in duel chat.', 40, '{"char":"🤍"}'::jsonb, true, false),
  ('emote-laugh', 'emotes', 'smile', 'Laugh Emote', 'Send 😂 in duel chat.', 30, '{"char":"😂"}'::jsonb, true, false),
  ('emote-shock', 'emotes', 'zap', 'Shock Emote', 'Send 🤯 in duel chat.', 40, '{"char":"🤯"}'::jsonb, true, false),
  ('frame-bolt', 'frames', 'zap', 'Bolt Frame', 'A bold offset frame. Pure voltage.', 250, '{"slot":"frame","frame":"bolt"}'::jsonb, true, false),
  ('frame-halo', 'frames', 'star', 'Halo Ring', 'A clean ring of honor around your avatar.', 150, '{"slot":"frame","frame":"halo"}'::jsonb, true, false),
  ('frame-star', 'frames', 'star', 'Star Frame', 'A radiant frame for duel champions.', 200, '{"slot":"frame","frame":"star"}'::jsonb, true, true),
  ('guess-plus', 'consumables', 'key', 'Extra Guess', 'Grants one extra code guess during a duel.', 70, '{}'::jsonb, true, true)
ON CONFLICT DO NOTHING;

INSERT INTO sp.achievements_catalog (id, name, icon, reward) VALUES
  ('camp10', 'Campaign Climber', 'flag', 50),
  ('camp30', 'Campaign King', 'crown', 200),
  ('first_buy', 'Retail Therapy', 'gift', 10),
  ('first_win', 'First Crack', 'trophy', 10),
  ('games_25', 'Persistent', 'timer', 40),
  ('ghost', 'Ghost Protocol', 'gem', 30),
  ('hard_win', 'Hard Mode', 'skull', 40),
  ('level_10', 'Supreme Mind', 'star', 80),
  ('level_5', 'Rising Star', 'star', 25),
  ('one_shot', 'Bullseye', 'target', 60),
  ('rich_1000', 'Spark Tycoon', 'gem', 100),
  ('rich_500', 'Spark Baron', 'crown', 50),
  ('speed_30', 'Lightning Bolt', 'zap', 60),
  ('speed_60', 'Lightning', 'timer', 30),
  ('streak_3', 'Hat Trick', 'flame', 20),
  ('streak_5', 'Unstoppable', 'zap', 40),
  ('win_10', 'Decade of Cracks', 'trophy', 40),
  ('win_50', 'Code Veteran', 'crown', 100)
ON CONFLICT DO NOTHING;

INSERT INTO sp.shop_items (id, category, icon, name, description, price, effect, available, featured) VALUES
  ('av-cat', 'cosmetics', 'cat', 'Cat Avatar', 'Nine lives, four digits.', 120, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-comet', 'cosmetics', 'comet', 'Comet Avatar', 'It definitely knows something about the code.', 180, '{"slot":"avatar"}'::jsonb, true, true),
  ('av-crown', 'cosmetics', 'crown', 'Crown Avatar', 'Royalty of the vault.', 200, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-ghost', 'cosmetics', 'ghost', 'Ghost Avatar', 'Silent. Unseen. Unstoppable.', 120, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-rocket', 'cosmetics', 'rocket', 'Rocket Avatar', 'For players who crack codes at escape velocity.', 150, '{"slot":"avatar"}'::jsonb, true, false),
  ('av-squirrel', 'cosmetics', 'squirrel', 'Squirrel Avatar', 'A cunning vault companion.', 120, '{"slot":"avatar"}'::jsonb, true, false),
  ('double', 'boosters', 'zap', 'Nova Boost', 'Doubles the Sparks earned on your next solo run.', 90, '{}'::jsonb, true, false),
  ('extra-guess', 'consumables', 'key', 'Spare Key', 'Grants one extra code guess for the current run.', 50, '{}'::jsonb, true, false),
  ('oracle', 'consumables', 'brain', 'The Oracle', 'Ask the AI Oracle one mystical, strategy-only hint.', 80, '{}'::jsonb, true, true),
  ('reveal', 'consumables', 'eye', 'Digit Lens', 'Instantly reveals one digit and its exact position.', 60, '{}'::jsonb, true, true),
  ('reveal2', 'consumables', 'eye', 'Deep Lens', 'Reveals TWO digits and their exact positions.', 100, '{}'::jsonb, true, true),
  ('skip', 'consumables', 'skip', 'Skip Ticket', 'Skip the current question — a fresh one takes its place.', 25, '{}'::jsonb, true, false),
  ('time-freeze', 'consumables', 'snowflake', 'Chrono Shard', 'Adds 60 seconds to the current run timer.', 45, '{}'::jsonb, true, false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════ REALTIME ═══════════════════════════════
-- 23 tables stream live (RLS guards every stream):
ALTER PUBLICATION supabase_realtime ADD TABLE mp.achievements_catalog;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.answers;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.chat;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.level_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.player_achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.shop_items;
ALTER PUBLICATION supabase_realtime ADD TABLE mp.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.answer_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.achievements_catalog;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.clues;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.games;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.level_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.player_achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.questions;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.shop_items;
ALTER PUBLICATION supabase_realtime ADD TABLE sp.transactions;
