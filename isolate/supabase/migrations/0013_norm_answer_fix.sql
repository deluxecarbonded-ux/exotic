-- 0013: fix the translate() target in mp.norm_answer (0012 had one alef
-- too many, so ى mapped to ا instead of ي), drop the standalone hamza ء
-- (سماء ≡ سما), and fold Eastern digits (٠-٩ Arabic, ०-९ Devanagari)
-- to ASCII for number answers (١٢٣ ≡ 123).

create or replace function mp.norm_answer(v text, kind text)
returns text
language sql
immutable
as $function$
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
$function$;
