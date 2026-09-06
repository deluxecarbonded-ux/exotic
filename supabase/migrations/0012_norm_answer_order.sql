-- 0012: reorder mp.norm_answer — Arabic folding must run BEFORE unaccent(),
-- because unaccent.rules maps ى (alef maqsura) to latin "a", which broke
-- مستشفى ≡ مستشفي. Order: lower → strip marks/zero-width → Arabic letter
-- folding + ال-strip → unaccent (latin diacritics) → kind shaping.

create or replace function mp.norm_answer(v text, kind text)
returns text
language sql
immutable
as $function$
  with base as (
    select lower(btrim(coalesce(v, ''))) as s
  ),
  zw as (
    select regexp_replace(s, '[\u200B-\u200D\uFEFF\u064B-\u065F\u0670\u0640]', '', 'g') as s
    from base
  ),
  ar as (
    select regexp_replace(translate(s, 'أإآٱىةؤئ', 'اااااهوي'), '^ال', '') as s
    from zw
  ),
  acc as (
    select public.unaccent(s) as s from ar
  )
  select case
    when kind = 'number' then regexp_replace(s, '[^0-9]', '', 'g')
    else replace(s, ' ', '')
  end
  from acc
$function$;
