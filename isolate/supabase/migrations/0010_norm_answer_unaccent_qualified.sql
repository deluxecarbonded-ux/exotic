-- 0010: qualify public.unaccent inside mp.norm_answer.
-- The mp.* RPCs are SECURITY DEFINER with search_path = '' , so the bare
-- unaccent(...) call added in 0009 was unresolvable at runtime
-- ("function unaccent(text) does not exist") whenever norm_answer was
-- invoked from create_round / answer_round.

create or replace function mp.norm_answer(v text, kind text)
returns text
language sql
immutable
as $function$
  select case
    when kind = 'number' then
      regexp_replace(public.unaccent(lower(btrim(coalesce(v, '')))), '[^0-9]', '', 'g')
    else
      replace(public.unaccent(lower(btrim(coalesce(v, '')))), ' ', '')
  end
$function$;
