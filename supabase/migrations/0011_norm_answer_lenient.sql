-- 0011: lenient answer matching in mp.norm_answer (client parity).
-- Arabic: strip tashkeel/tatweel, unify alef forms (أ إ آ ٱ → ا),
-- ى → ي, ة → ه, ؤ → و, ئ → ي, and drop the definite article ال prefix —
-- so "المريخ", "مريخ", "مدرسة" and "مدرسه" are ALL correct.
-- Latin: unaccent already folds diacritics (é→e, ñ→n) and ß→ss, ø→o, etc.
-- Zero-width joiners are removed for Hindi and friends.

create or replace function mp.norm_answer(v text, kind text)
returns text
language sql
immutable
as $function$
  with base as (
    select public.unaccent(lower(btrim(coalesce(v, '')))) as s
  ),
  marks as (
    select regexp_replace(
      translate(s, 'أإآٱىةؤئ', 'اااااهوي'),
      '[\u200B-\u200D\uFEFF\u064B-\u065F\u0670\u0640]',
      '', 'g') as s
    from base
  )
  select case
    when kind = 'number' then
      regexp_replace(regexp_replace(s, '^ال', ''), '[^0-9]', '', 'g')
    else
      replace(regexp_replace(s, '^ال', ''), ' ', '')
  end
  from marks
$function$;
