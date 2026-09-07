-- 0009: make mp.norm_answer match the client-side normalizeAnswer exactly.
-- Client (lib/game.ts): trim → lower → NFD → strip combining marks U+0300–U+036F
-- → number: digits only / word: remove whitespace.
-- Before this fix an accented stored answer ("café") could never match an
-- unaccented typed guess ("cafe"), and spaced word answers ("new york")
-- wouldn't match their unspaced form.

create extension if not exists unaccent;

create or replace function mp.norm_answer(v text, kind text)
returns text
language sql
immutable
as $function$
  select case
    when kind = 'number' then
      regexp_replace(unaccent(lower(btrim(coalesce(v, '')))), '[^0-9]', '', 'g')
    else
      replace(unaccent(lower(btrim(coalesce(v, '')))), ' ', '')
  end
$function$;
