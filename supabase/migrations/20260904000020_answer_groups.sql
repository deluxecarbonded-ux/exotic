-- 0020: multilingual answers — any language's word for the same concept
-- is accepted (question relocalizes when the player switches language;
-- the answer must not stay stuck in the original language).

begin;

create table if not exists public.answer_groups (
  grp    text not null,
  lang   text not null,
  answer text not null,
  constraint answer_groups_pk primary key (grp, lang)
);

delete from public.answer_groups;
insert into public.answer_groups (grp, lang, answer) values
('mercury','en','mercury'),
('mercury','es','mercurio'),
('mercury','fr','mercure'),
('mercury','de','merkur'),
('mercury','it','mercurio'),
('mercury','pt','mercurio'),
('mercury','nl','mercurius'),
('mercury','sv','merkurius'),
('mercury','tr','merkur'),
('mercury','pl','merkury'),
('mercury','ru','меркурий'),
('mercury','ar','عطارد'),
('mercury','hi','बुध'),
('pacific','en','pacific'),
('pacific','es','pacifico'),
('pacific','fr','pacifique'),
('pacific','de','pazifik'),
('pacific','it','pacifico'),
('pacific','pt','pacifico'),
('pacific','nl','pacifisch'),
('pacific','sv','stilla'),
('pacific','tr','pasifik'),
('pacific','pl','pacyfik'),
('pacific','ru','тихий'),
('pacific','ar','الهادي'),
('pacific','hi','प्रशांत'),
('mars','en','mars'),
('mars','es','marte'),
('mars','fr','mars'),
('mars','de','mars'),
('mars','it','marte'),
('mars','pt','marte'),
('mars','nl','mars'),
('mars','sv','mars'),
('mars','tr','mars'),
('mars','pl','mars'),
('mars','ru','марс'),
('mars','ar','المريخ'),
('mars','hi','मंगल'),
('gold','en','gold'),
('gold','es','oro'),
('gold','fr','or'),
('gold','de','gold'),
('gold','it','oro'),
('gold','pt','ouro'),
('gold','nl','goud'),
('gold','sv','guld'),
('gold','tr','altin'),
('gold','pl','zloto'),
('gold','ru','золото'),
('gold','ar','ذهب'),
('gold','hi','सोना'),
('carbon','en','carbon'),
('carbon','es','carbono'),
('carbon','fr','carbone'),
('carbon','de','kohlenstoff'),
('carbon','it','carbonio'),
('carbon','pt','carbono'),
('carbon','nl','koolstof'),
('carbon','sv','kol'),
('carbon','tr','karbon'),
('carbon','pl','wegiel'),
('carbon','ru','углерод'),
('carbon','ar','كربون'),
('carbon','hi','कार्बन'),
('nitrogen','en','nitrogen'),
('nitrogen','es','nitrogeno'),
('nitrogen','fr','azote'),
('nitrogen','de','stickstoff'),
('nitrogen','it','azoto'),
('nitrogen','pt','nitrogenio'),
('nitrogen','nl','stikstof'),
('nitrogen','sv','kvave'),
('nitrogen','tr','azot'),
('nitrogen','pl','azot'),
('nitrogen','ru','азот'),
('nitrogen','ar','نيتروجين'),
('nitrogen','hi','नाइट्रोजन'),
('clock','en','clock'),
('clock','es','reloj'),
('clock','fr','horloge'),
('clock','de','uhr'),
('clock','it','orologio'),
('clock','pt','relogio'),
('clock','nl','klok'),
('clock','sv','klocka'),
('clock','tr','saat'),
('clock','pl','zegar'),
('clock','ru','часы'),
('clock','ar','ساعة'),
('clock','hi','घड़ी'),
('towel','en','towel'),
('towel','es','toalla'),
('towel','fr','serviette'),
('towel','de','handtuch'),
('towel','it','asciugamano'),
('towel','pt','toalha'),
('towel','nl','handdoek'),
('towel','sv','handduk'),
('towel','tr','havlu'),
('towel','pl','rcznik'),
('towel','ru','полотенце'),
('towel','ar','منشفة'),
('towel','hi','तौलिया'),
('piano','en','piano'),
('piano','es','piano'),
('piano','fr','piano'),
('piano','de','klavier'),
('piano','it','pianoforte'),
('piano','pt','piano'),
('piano','nl','piano'),
('piano','sv','piano'),
('piano','tr','piyano'),
('piano','pl','pianino'),
('piano','ru','пианино'),
('piano','ar','بيانو'),
('piano','hi','पियानो'),
('age','en','age'),
('age','es','edad'),
('age','fr','âge'),
('age','de','alter'),
('age','it','età'),
('age','pt','idade'),
('age','nl','leeftijd'),
('age','sv','ålder'),
('age','tr','yaş'),
('age','pl','wiek'),
('age','ru','возраст'),
('age','ar','العمر'),
('age','hi','उम्र'),
('steps','en','steps'),
('steps','es','pasos'),
('steps','fr','pas'),
('steps','de','schritte'),
('steps','it','passi'),
('steps','pt','passos'),
('steps','nl','stappen'),
('steps','sv','steg'),
('steps','tr','adım'),
('steps','pl','kroki'),
('steps','ru','шаги'),
('steps','ar','خطوات'),
('steps','hi','कदम');

create or replace function public.same_answer_group(a text, b text, kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
      from public.answer_groups x
      join public.answer_groups y on x.grp = y.grp
     where sp.norm_answer(x.answer, kind) = a
       and sp.norm_answer(y.answer, kind) = b
  )
$function$
;

revoke all on public.answer_groups from anon, authenticated;

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

-- realtime publication (standing rule: every table)
do $$
begin
  alter publication supabase_realtime add table public.answer_groups;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

commit;
