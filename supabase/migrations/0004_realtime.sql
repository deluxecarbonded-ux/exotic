-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0004 — REALTIME + API EXPOSURE
--  Live subscriptions (no page refresh, ever) + PostgREST schemas.
-- ═══════════════════════════════════════════════════════════════

-- Full row images so UPDATE/DELETE events carry complete payloads.
alter table sp.profiles replica identity full;
alter table mp.profiles replica identity full;
alter table mp.rooms replica identity full;
alter table mp.room_players replica identity full;
alter table mp.rounds replica identity full;
alter table mp.guesses replica identity full;
alter table mp.chat replica identity full;

-- Publish the live tables to Supabase Realtime.
do $$
begin
  alter publication supabase_realtime add table sp.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.room_players;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.rounds;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.guesses;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table mp.chat;
exception when duplicate_object then null;
end $$;

-- Expose the `sp` and `mp` schemas to the PostgREST API so the
-- app can query them with supabase.schema('sp') / schema('mp').
do $$
begin
  execute 'alter role authenticator set pgrst.db_schemas = ''public, sp, mp''';
exception when others then
  raise notice 'pgrst.db_schemas could not be set: %', sqlerrm;
end $$;

notify pgrst, 'reload config';
