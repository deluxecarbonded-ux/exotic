-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0005 — FULL REALTIME + INDEX ADVISOR
--  • Publishes EVERY game table to supabase_realtime (equivalent of
--    the Studio "Enable Realtime" toggle on all tables) and sets
--    replica identity full so UPDATE/DELETE events carry full rows.
--    RLS still governs delivery — zero-policy tables (secrets,
--    answers) stay invisible to every API/realtime client.
--  • Enables the extensions required by Index Advisor:
--    hypopg (hypothetical indexes) + pg_stat_statements (query stats).
-- ═══════════════════════════════════════════════════════════════

-- ── Realtime: remaining SP tables ────────────────────────────────
alter table sp.games            replica identity full;
alter table sp.secrets          replica identity full;
alter table sp.guesses          replica identity full;
alter table sp.clues            replica identity full;
alter table sp.shop_items       replica identity full;
alter table sp.inventory        replica identity full;
alter table sp.transactions     replica identity full;
alter table sp.achievements_catalog    replica identity full;
alter table sp.player_achievements     replica identity full;

-- ── Realtime: remaining MP tables ────────────────────────────────
alter table mp.secrets          replica identity full;
alter table mp.answers          replica identity full;
alter table mp.shop_items       replica identity full;
alter table mp.inventory        replica identity full;
alter table mp.transactions     replica identity full;
alter table mp.achievements_catalog    replica identity full;
alter table mp.player_achievements     replica identity full;

do $$ begin alter publication supabase_realtime add table sp.games;            exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.secrets;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.guesses;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.clues;            exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.shop_items;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.inventory;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.transactions;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.achievements_catalog;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sp.player_achievements;   exception when duplicate_object then null; end $$;

do $$ begin alter publication supabase_realtime add table mp.secrets;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.answers;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.shop_items;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.inventory;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.transactions;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.achievements_catalog;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table mp.player_achievements;   exception when duplicate_object then null; end $$;

-- ── Index Advisor extensions ─────────────────────────────────────
do $$ begin create extension if not exists hypopg with schema extensions; exception when others then raise notice 'hypopg: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_stat_statements with schema extensions; exception when others then raise notice 'pg_stat_statements: %', sqlerrm; end $$;

notify pgrst, 'reload config';
