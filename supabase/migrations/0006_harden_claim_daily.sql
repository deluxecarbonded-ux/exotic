-- ═══════════════════════════════════════════════════════════════
--  Exotic · Migration 0006 — HARDENING
--  claim_daily() guards: a caller without a profile row (impossible
--  through the app's separated auth, but reachable via a raw API
--  call) would previously NULL-out the currency column. Now it
--  raises a clean error instead.
-- ═══════════════════════════════════════════════════════════════

create or replace function sp.claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function mp.claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
